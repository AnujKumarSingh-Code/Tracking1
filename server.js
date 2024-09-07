const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { google } = require('googleapis');
require("dotenv").config();

// Google Analytics scopes
const scopes = 'https://www.googleapis.com/auth/analytics.readonly';

// Replace escaped newlines in the private key
const privateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');

// Google Analytics JWT for authentication
const jwt = new google.auth.JWT(
    process.env.CLIENT_EMAIL,
    null,
    privateKey,
    scopes
);

// Initialize Express app
const app = express();

// Middleware to parse incoming JSON requests
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect('mongodb+srv://anujkumarsinghcoder:QgSvKNYjniJWzg0F@project-anal.amlt0ce.mongodb.net/?retryWrites=true&w=majority&appName=project-anal');

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

// API route to get link stats from Google Analytics Data API (GA4)
app.get('/get-link-stats', async (req, res) => {

    
    try {
        // Authorize the client
        await jwt.authorize();

        // Initialize the GA4 Data API client
        const analyticsData = google.analyticsdata('v1beta');

        // GA4 Property ID (replace with your property ID)
        const propertyId = process.env.VIEW_ID;

        // Define the request parameters for GA4 Data API
        const [response] = await analyticsData.properties.runReport({
            property: `properties/${propertyId}`,
            requestBody: {
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                metrics: [{ name: 'eventCount' }], // Number of events (link clicks)
                dimensions: [{ name: 'eventName' }, { name: 'pagePath' }], // Event name and URL (pagePath)
                dimensionFilter: {
                    filter: {
                        fieldName: 'eventName',
                        stringFilter: {
                            matchType: 'EXACT',
                            value: 'link_click', // Replace with your custom event name
                        },
                    },
                },
            },
        });

        // Send the stats back as JSON
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ success: false, message: error});
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
