const mongoose = require('mongoose');

const placeSchema = new mongoose.Schema({
    place: String,
    state: String,
    latitude: Number,
    longitude: Number,
    expected_time_to_visit: String,
    entry_fees: String,
    description: [String]
}, { collection: 'places' });


module.exports = mongoose.model('Place',placeSchema);