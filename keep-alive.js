const http = require('http');

// Create an HTTP server to keep the bot alive
const keepAlive = () => {
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot is running');
    }).listen(3000, () => {
        console.log('Keep-alive server running on port 3000');
    });
};

module.exports = keepAlive;
