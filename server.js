const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { google } = require('googleapis');
require("dotenv").config();

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
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

// Store tokens in memory (or use a database for persistence)
let tokens = null;

// Automatically handle OAuth2 callback and retrieve tokens
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;

    try {
        const { tokens: receivedTokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(receivedTokens);
        
        // Save the tokens for future use
        tokens = receivedTokens;
        console.log('Tokens received:', tokens);

        res.send('Authorization successful! Tokens acquired, you can now use the application.');
    } catch (error) {
        console.error('Error getting tokens:', error);
        res.status(500).send('Error during authentication.');
    }
});


// Middleware to ensure tokens are set before making requests
app.use((req, res, next) => {
    if (tokens) {
        oauth2Client.setCredentials(tokens);
    }
    next();
});

// API route to get link stats from Google Analytics Data API (GA4)
app.get('/get-link-stats', async (req, res) => {
    try {
        // Ensure the client is authorized with valid tokens
        if (!tokens || !tokens.access_token) {
            return res.status(401).json({ success: false, message: 'No access token available. Please authorize the app.' });
        }

        // Initialize the GA4 Data API client with the OAuth2 client
        const analyticsData = google.analyticsdata('v1beta');

        // Make the API request
        const [response] = await analyticsData.properties.runReport({
            property: `properties/${process.env.VIEW_ID}`,
            requestBody: {
                dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                metrics: [{ name: 'eventCount' }],
                dimensions: [{ name: 'eventName' }, { name: 'pagePath' }],
                dimensionFilter: {
                    filter: {
                        fieldName: 'eventName',
                        stringFilter: {
                            matchType: 'EXACT',
                            value: 'link_click',
                        },
                    },
                },
            },
            auth: oauth2Client,
        });

        // Send the stats back as JSON
        res.status(200).json(response);
    } catch (error) {
        console.error('Error fetching link stats:', error);
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

// Redirect user to Google's OAuth 2.0 consent page for authorization
app.get('/authorize', (req, res) => {
    const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    res.redirect(authorizeUrl);
});
