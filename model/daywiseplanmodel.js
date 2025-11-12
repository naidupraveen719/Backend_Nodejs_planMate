const mongoose = require('mongoose');

// This can be the same sub-schema used in your planModel
const placeInItinerarySchema = new mongoose.Schema({
    place: String,
    latitude: Number,
    longitude: Number,
    expected_time_to_visit: String,
    entry_fees: String,
}, { _id: false });

// A schema for a single day in the itinerary
const daySchema = new mongoose.Schema({
    day: Number,
    places: [placeInItinerarySchema],
    hoursSpent: Number,
}, { _id: false });

const itinerarySchema = new mongoose.Schema({
    // Link to the user who owns this itinerary
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // A reference back to the original draft plan for tracking
    originalPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: true
    },
    // The main data: an array of day objects
    itinerary: [daySchema],
    
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { collection: 'itineraries' });

module.exports = mongoose.model('Itinerary', itinerarySchema);