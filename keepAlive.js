const express = require('express');
const app = express();

app.all('/', (req, res) => {
    res.send('Bot is running!');
});

function keepAlive() {
    app.listen(3000, () => {
        console.log('Server is ready on port 3000');
    });
}

module.exports = keepAlive;
