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

// Scopes for Google Analytics
const scopes = ['https://www.googleapis.com/auth/analytics.readonly'];

// Initialize Express app
const app = express();

// Middleware to parse incoming JSON requests
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect('mongodb+srv://anujkumarsinghcoder:QgSvKNYjniJWzg0F@project-anal.amlt0ce.mongodb.net/?retryWrites=true&w=majority&appName=project-anal', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

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

// Route to initiate OAuth2 flow
app.get('/auth', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
    });
    res.redirect(authUrl);
});

// OAuth2 callback route to handle authorization code
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        // Save the tokens for future use
        console.log('Tokens:', tokens);

        res.send('Authorization successful! You can close this window.');
    } catch (error) {
        console.error('Error getting tokens:', error);
        res.status(500).send('Error during authentication.');
    }
});

// API route to get link stats from Google Analytics Data API (GA4)
app.get('/get-link-stats', async (req, res) => {
    try {
        // Ensure that the OAuth2 client has been authorized
        if (!oauth2Client.credentials.access_token) {
            return res.status(401).json({ success: false, message: 'No access token available. Please authorize the application first.' });
        }

        // Initialize the GA4 Data API client with the OAuth2 client
        const analyticsData = google.analyticsdata('v1beta');

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
        res.status(200).json(response.data);
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
