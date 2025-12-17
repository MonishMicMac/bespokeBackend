const redis = require("redis");

const subscriber = redis.createClinte({
    url : "redis://192.168.1.7:6379"
});

subscriber.connect();

subscriber.subscribe("order", (message) => {
    console.log("Received:", message)
});