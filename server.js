const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

// Initialize Express app
const app = express();

// Middleware to parse incoming JSON requests
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection (replace with your MongoDB URI)
mongoose.connect('mongodb+srv://anujkumarsinghmain:67pdfRnUT1vZBmbX@cluster0.gxqch.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

// MongoDB Schema for tracking clicks
const clickSchema = new mongoose.Schema({
    ownerId: String,
    linkUrl: String,
    timestamp: { type: Date, default: Date.now },
});

const Click = mongoose.model('Click', clickSchema);

// API route to receive link click data and store in MongoDB
app.post('/track-click', async (req, res) => {
    const { ownerId, linkUrl } = req.body;
    try {
        const click = new Click({ ownerId, linkUrl });
        await click.save();
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Serve the HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Start the server
app.listen(4000, () => {
    console.log('Server running on port 4000');
});
