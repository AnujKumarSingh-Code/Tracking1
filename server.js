const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { google } = require('googleapis');
require("dotenv").config();

// Google Analytics scopes
const scopes = ['https://www.googleapis.com/auth/analytics.readonly'];

const jwt = new google.auth.JWT(
    process.env.CLIENT_EMAIL,
    null,
    process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes
);

// console.log(process.env.PRIVATE_KEY.replace(/\\n/g, "\n") , "AAAAAAAAAAAA")

// Initialize Express app
const app = express();

// Middleware to parse incoming JSON requests
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// API route to get link stats from Google Analytics
app.get('/get-link-stats', async (req, res) => {
    try {
        // Authorize the client
        await jwt.authorize();

        // Initialize the Analytics Reporting API
        const analyticsreporting = google.analyticsreporting({
            version: 'v4',
            auth: jwt
        });

        // Define the request parameters
        const response = await analyticsreporting.reports.batchGet({
            requestBody: {
                reportRequests: [
                    {
                        viewId: process.env.VIEW_ID,  // Replace with your Google Analytics view ID
                        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                        metrics: [{ expression: 'ga:totalEvents' }],
                        dimensions: [{ name: 'ga:eventLabel' }, { name: 'ga:eventCategory' }, { name: 'ga:eventAction' }],
                        filtersExpression: 'ga:eventCategory==link_click',  // Replace with your event category
                    },
                ],
            },
        });

        // Send the stats back as JSON
        res.status(200).json(response.data);
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
