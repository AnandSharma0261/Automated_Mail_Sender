require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

const app = express();
app.use(express.static('public'));
app.use(bodyParser.json({ limit: '50mb' }));

// Configure email credentials using environment variables
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.post('/send-emails', async (req, res) => {
    try {
        const { emails, subject, message, attachment } = req.body;
        const batchSize = 50;
        const results = [];

        // Split emails into batches
        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            
            // Send emails in current batch
            const promises = batch.map(email => {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: subject,
                    text: message,
                    attachments: attachment ? [
                        {
                            filename: attachment.name,
                            content: attachment.data.split('base64,')[1],
                            encoding: 'base64'
                        }
                    ] : []
                };

                return transporter.sendMail(mailOptions);
            });

            // Wait for all emails in this batch to be sent
            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            // Add a small delay between batches to avoid rate limits
            if (i + batchSize < emails.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        res.json({
            success: true,
            message: `Successfully sent ${results.length} emails`,
            results
        });
    } catch (error) {
        console.error('Error sending emails:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending emails',
            error: error.message
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});