const express = require('express');
const mongoose = require('mongoose');
const Place = require('../model/placesmodel');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { z } = require('zod');
const { StructuredOutputParser } = require('langchain/output_parsers');
const { PromptTemplate } = require('@langchain/core/prompts');
const middleware = require('../middlewares/authmiddleware');
const Registeruser = require('../model/usersmodel');
const Plan = require("../model/planModel");
require("dotenv").config();

const router = express.Router();

// ✅ Setup Gemini model
const model = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-flash",
  apiKey: process.env.GOOGLE_API_KEY,
});

// ✅ Schema for coordinates
const coordinatesSchema = z.object({
  latitude: z.number().describe("Latitude of the place"),
  longitude: z.number().describe("Longitude of the place"),
});

const parser = StructuredOutputParser.fromZodSchema(coordinatesSchema);

const prompt = new PromptTemplate({
  template:
    "Give me the latitude and longitude of {place}. Format = {format_instructions}",
  inputVariables: ["place"],
  partialVariables: {
    format_instructions: parser.getFormatInstructions(),
  },
});

const chain = prompt.pipe(model).pipe(parser);

// ----------------------
// Helper Functions
// ----------------------
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function createDistanceMatrix(places) {
  const size = places.length;
  const matrix = Array(size).fill(null).map(() => Array(size).fill(0));
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i === j) continue;
      const dist = haversine(
        places[i].latitude,
        places[i].longitude,
        places[j].latitude,
        places[j].longitude
      );
      matrix[i][j] = Math.round(dist); // km
    }
  }
  return matrix;
}

function solveTSP(places, startIndex = 0) {
  const size = places.length;
  const distanceMatrix = createDistanceMatrix(places);
  const visited = Array(size).fill(false);
  const route = [startIndex];
  visited[startIndex] = true;
  let current = startIndex;
  for (let step = 1; step < size; step++) {
    let nearest = -1;
    let minDist = Infinity;
    for (let j = 0; j < size; j++) {
      if (!visited[j] && distanceMatrix[current][j] < minDist) {
        nearest = j;
        minDist = distanceMatrix[current][j];
      }
    }
    if (nearest !== -1) {
      route.push(nearest);
      visited[nearest] = true;
      current = nearest;
    }
  }
  return { route, distanceMatrix };
}

function parseTimeToHours(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  let totalHours = 0;
  const hoursMatch = timeString.match(/(\d+(\.\d+)?)\s*hour/i);
  const minutesMatch = timeString.match(/(\d+)\s*minute/i);
  if (hoursMatch) totalHours += parseFloat(hoursMatch[1]);
  if (minutesMatch) totalHours += parseInt(minutesMatch[1], 10) / 60;
  return totalHours;
}

function parseEntryFee(feeString) {
    if (!feeString || typeof feeString !== 'string') return 0;
    const match = feeString.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
}

function calculateFeasiblePlaces(optimalPath, distanceMatrix, userInput, costPerKm = 15) {
  const budget = parseInt(userInput.budget, 10);
  const days = parseInt(userInput.days, 10);
  const passengers = parseInt(userInput.passengers, 10);
  
  const dailyHours = 18;
  const totalHours = days * dailyHours;
  let totalCost = 0;
  let totalTime = 0;
  let feasiblePlaces = [optimalPath[0]];

  for (let i = 1; i < optimalPath.length; i++) {
    const prev = optimalPath[i - 1];
    const curr = optimalPath[i];
    const dist = distanceMatrix[prev.index][curr.index];
    const travelCost = dist * costPerKm * passengers;
    
    const entryFee = parseEntryFee(curr.entry_fees) * passengers;
    const visitTime = parseTimeToHours(curr.expected_time_to_visit);
    
    if (
      totalCost + travelCost + entryFee <= budget &&
      totalTime + visitTime <= totalHours
    ) {
      totalCost += travelCost + entryFee;
      totalTime += visitTime;
      feasiblePlaces.push(curr);
    } else {
      break;
    }
  }
  return {
    feasiblePlaces,
    totalCost: Math.round(totalCost),
    totalTime: parseFloat(totalTime.toFixed(2)),
    totalBudget: budget,
    totalHours,
  };
}

// ----------------------
// Main Express Route
// ----------------------
router.post('/api/plan-trip', middleware, async (req, res) => {
  // Use a single try/catch block for the entire process
  try {
    // 1. First, validate the user exists
    const user = await Registeruser.findById(req.user.id);
    if (!user) {
      // If the user is not found, send an error and STOP execution with 'return'
      return res.status(404).json({ message: 'User not found' });
    }
    // If the user is found, DO NOT send a response. Just continue.
    console.log("Authenticated user:", user.email);

    // 2. Proceed with your trip planning logic
    const { selectedCategories, startAddress, budget, days, passengers } = req.body;
    console.log("Received form data:", req.body);

    let startCoordinates = null;
    if (startAddress) {
      try {
        startCoordinates = await chain.invoke({ place: startAddress });
        console.log("Start Address Coordinates:", startCoordinates);
      } catch (err) {
        console.error("Error fetching startAddress coordinates:", err);
      }
    }

    if (!selectedCategories || selectedCategories.length === 0) {
      return res.status(200).json({ startCoordinates, optimalPath: [], feasiblePlan: {} });
    }

    const query = { description: { $in: selectedCategories } };
    const projection = { _id: 0, place: 1, latitude: 1, longitude: 1, expected_time_to_visit: 1, entry_fees: 1 };
    
    const matchingPlacesDocs = await Place.find(query, projection);
    console.log(`Found ${matchingPlacesDocs.length} matching places.`);

    let matchingPlaces = matchingPlacesDocs.map(doc => doc.toObject());

    if (startCoordinates) {
      matchingPlaces.unshift({
        place: startAddress,
        latitude: startCoordinates.latitude,
        longitude: startCoordinates.longitude,
        expected_time_to_visit: "0",
        entry_fees: "0",
      });
    }

    const indexedPlaces = matchingPlaces.map((p, i) => ({ ...p, index: i }));

    const { route, distanceMatrix } = solveTSP(indexedPlaces, 0);
    const optimalPath = route.map((i) => indexedPlaces[i]);

    const feasiblePlan = calculateFeasiblePlaces(optimalPath, distanceMatrix, { budget, days, passengers });
    console.log(`Number of feasible places: ${feasiblePlan.feasiblePlaces.length}`);
    console.log("Feasible Plan:", feasiblePlan);

    // ✅ Correctly create the new plan instance
    const newPlan = new Plan({
      userId: req.user.id,
      startAddress: req.body.startAddress,
      days: req.body.days,             // Add the other user inputs
      passengers: req.body.passengers,
     feasiblePlaces: feasiblePlan.feasiblePlaces, // Use the array from the plan object
     totalCost: feasiblePlan.totalCost,           // Use the cost from the plan object
     totalTime: feasiblePlan.totalTime,           // Use the time from the plan object
     totalBudget: req.body.budget,                // Use 'budget' from the request body
});

// Save the plan in DB
await newPlan.save();

    // 3. Send the ONE and ONLY successful response at the very end
    res.status(200).json({
      savedPlan:newPlan
    });

  } catch (error) {
    // If any part of the process fails, this single catch block will handle it
    console.error("Error processing trip plan:", error);
    // Ensure you haven't already sent a response before sending the error
    if (!res.headersSent) {
      res.status(500).json({ message: "An error occurred on the server." });
    }
  }
});

module.exports = router;