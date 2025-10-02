/**
 * Simple test function to verify deployment works
 */
const {onCall} = require("firebase-functions/v2/https");

exports.ping = onCall({
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (request) => {
    return {
        status: "ok",
        timestamp: new Date().toISOString(),
        message: "Nimbus Functions are live!"
    };
});
