const mongoose = require('mongoose');

// You can define a sub-schema for the places in your plan
const placeInPlanSchema = new mongoose.Schema({
    place: String,
    latitude: Number,
    longitude: Number,
    distanceFromPrev: Number,   // km from previous place
    travelCost: Number,         // cost for this segment
    entryFee: Number,           // entry fee for this place
    timeToVisit: Number 
    // ... other place details
}, { _id: false }); // No need for separate IDs on sub-documents

const planSchema = new mongoose.Schema({
    // This is the link back to the user
    userId: {
        type: mongoose.Schema.Types.ObjectId, // Stores the user's unique _id
        ref: 'User', // This tells Mongoose it refers to the 'User' collection
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'confirmed'], // Only allows these two values
        default: 'draft'             // Automatically sets new plans to 'draft'
    },
    // The rest of the plan's data
    startAddress: String,
    feasiblePlaces: [placeInPlanSchema],
    totalCost: Number,
    totalTime: Number,
    totalBudget: Number,
    days: Number,       // user input: no. of days
    passengers: Number ,
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { collection: 'plans' });

module.exports = mongoose.model('Plan', planSchema);