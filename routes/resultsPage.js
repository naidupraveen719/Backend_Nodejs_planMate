const express = require('express');
const router = express.Router();
const Plan = require('../model/planModel');
const Itinerary = require('../model/daywiseplanmodel');;
const middleware = require('../middlewares/authmiddleware');

// =================================================================
// SECTION 1: HELPER FUNCTIONS
// =================================================================

function parseTimeToHours(timeString) {
    if (!timeString || typeof timeString !== 'string') return 0;
    let totalHours = 0;
    const hoursMatch = timeString.match(/(\d+(\.\d+)?)\s*hour/i);
    const minutesMatch = timeString.match(/(\d+)\s*minute/i);
    if (hoursMatch) totalHours += parseFloat(hoursMatch[1]);
    if (minutesMatch) totalHours += parseInt(minutesMatch[1], 10) / 60;
    return totalHours;
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const toRad = (deg) => (deg * Math.PI) / 180;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dphi = toRad(lat2 - lat1);
    const dlambda = toRad(lon2 - lon1);
    const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ✅ CORRECTED: This function now respects the total number of trip days.
function organizePlanByDay(plan, dailyHours = 12, avgSpeedKmph = 40) {
    if (!plan || !plan.feasiblePlaces || plan.feasiblePlaces.length <= 1) {
        return [];
    }
    
    const totalTripDays = parseInt(plan.days, 10); // Get the trip duration
    const dayWisePlan = [];
    let currentDay = { day: 1, places: [], hoursSpent: 0 };

    for (let i = 1; i < plan.feasiblePlaces.length; i++) {
        const prevPlace = plan.feasiblePlaces[i - 1];
        const currentPlace = plan.feasiblePlaces[i];

        const distance = haversine(prevPlace.latitude, prevPlace.longitude, currentPlace.latitude, currentPlace.longitude);
        const travelTime = distance / avgSpeedKmph;
        const visitTime = parseTimeToHours(currentPlace.expected_time_to_visit);
        const timeForThisStop = travelTime + visitTime;

        // Check if a new day is needed (either time is up OR we are past the trip duration)
        if (currentDay.hoursSpent + timeForThisStop > dailyHours) {
            dayWisePlan.push(currentDay); // Save the completed day
            
            // ✅ STOP creating new days if the trip duration is reached
            if (currentDay.day >= totalTripDays) {
                return dayWisePlan;
            }
            
            currentDay = { day: currentDay.day + 1, places: [], hoursSpent: 0 };
        }

        currentDay.places.push(currentPlace);
        currentDay.hoursSpent += timeForThisStop;
    }

    if (currentDay.places.length > 0) {
        dayWisePlan.push(currentDay);
    }
    
    return dayWisePlan;
}

// =================================================================
// SECTION 2: EXPRESS ROUTES
// =================================================================

router.get('/api/plans/:id', middleware, async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }
    if (plan.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const dayWisePlan = organizePlanByDay(plan);

    res.status(200).json({
      originalPlan: plan,
      dayWisePlan: dayWisePlan
    });
  } catch (error) {
    console.error("Error fetching plan:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

router.post('/api/itineraries', middleware, async (req, res) => {
    try {
        const { originalPlanId, dayWisePlan } = req.body;
        if (!originalPlanId || !dayWisePlan || dayWisePlan.length === 0) {
            return res.status(400).json({ message: "Missing required plan data." });
        }
        const newItinerary = new Itinerary({
            userId: req.user.id,
            originalPlanId: originalPlanId,
            itinerary: dayWisePlan
        });
        await newItinerary.save();
        await Plan.findByIdAndUpdate(originalPlanId, { status: 'confirmed' });
        res.status(201).json({ message: "Itinerary saved successfully!", itinerary: newItinerary });
    } catch (error) {
        console.error("Error saving itinerary:", error);
        res.status(500).json({ message: "Failed to save itinerary." });
    }
});

module.exports = router;