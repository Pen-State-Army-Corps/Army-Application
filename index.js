const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();

// Load cooldown data
let cooldownData = {};
if (fs.existsSync('cooldowns.json')) {
    cooldownData = JSON.parse(fs.readFileSync('cooldowns.json'));
}

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'supersecret',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Discord Strategy
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI,
    scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
    // Store Discord user info in session
    done(null, { id: profile.id, username: `${profile.username}#${profile.discriminator}` });
}));

passport.serializeUser((user, done) => {
    done(null, user);
});
passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Serve static files (logo, css, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Login page
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        const userId = req.user.id;
        const now = Date.now();
        const lastApplied = cooldownData[userId] || 0;
        const diff = now - lastApplied;

        if (diff < 7 * 24 * 60 * 60 * 1000) {
            const remainingDays = Math.ceil((7 * 24 * 60 * 60 * 1000 - diff) / (24 * 60 * 60 * 1000));
            return res.send(`
                <html>
                    <head><title>Cooldown</title></head>
                    <body style="text-align:center; background:linear-gradient(135deg,#1a472a,#2d6a4f); color:white; font-family:sans-serif;">
                        <h1>⏳ Please wait ${remainingDays} more day(s)</h1>
                        <p>You can only apply once every 7 days.</p>
                    </body>
                </html>
            `);
        }
        return res.sendFile(path.join(__dirname, 'application.html'));
    } else {
        return res.send(`
            <html>
            <head>
                <title>Army Corps Application</title>
                <style>
                    body {
                        background: linear-gradient(135deg, #1a472a, #2d6a4f);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        font-family: Arial, sans-serif;
                        color: white;
                    }
                    .login-box {
                        text-align: center;
                        padding: 40px;
                        background: rgba(0,0,0,0.4);
                        border-radius: 12px;
                        box-shadow: 0 0 15px rgba(0,0,0,0.5);
                    }
                    .login-btn {
                        display: inline-block;
                        padding: 12px 25px;
                        background: #5865F2;
                        color: white;
                        font-size: 18px;
                        border-radius: 8px;
                        text-decoration: none;
                        font-weight: bold;
                        transition: background 0.3s;
                    }
                    .login-btn:hover {
                        background: #4752c4;
                    }
                </style>
            </head>
            <body>
                <div class="login-box">
                    <h1>Army Corps Application</h1>
                    <p>Please log in with Discord to continue</p>
                    <a class="login-btn" href="/login">🔑 Login with Discord</a>
                </div>
            </body>
            </html>
        `);
    }
});

// New endpoint to get logged-in user's Discord info
app.get("/me", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.json({});
    }
    res.json({
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar
    });
});

// Discord auth routes
app.get('/login', passport.authenticate('discord'));
app.get('/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    res.redirect('/');
});

// Handle form submission and set cooldown
app.post('/submit', express.json(), (req, res) => {
    if (!req.isAuthenticated()) return res.status(403).send('Unauthorized');

    cooldownData[req.user.id] = Date.now();
    fs.writeFileSync('cooldowns.json', JSON.stringify(cooldownData, null, 2));

    const embed = {
        title: "New Army Corps Application",
        color: 3447003,
        description: req.body.description || "No description provided",
        timestamp: new Date().toISOString(),
        footer: { text: `Applicant: ${req.user.username} (${req.user.id})` }
    };

    fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
    }).then(() => {
        res.send({ success: true });
    }).catch(err => {
        console.error(err);
        res.status(500).send({ error: 'Webhook failed' });
    });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));