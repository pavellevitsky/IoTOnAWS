// Publish Data from car devices - iot.js

// Require AWS IoT Device SDK
const awsIoT = require('aws-iot-device-sdk');

// Require crypto for random numbers generation
const crypto = require('crypto');

// Load the endpoint from file
const endpointFile = require('/home/ec2-user/environment/endpoint.json');

// Fetch the deviceName from the folder name
const deviceName = __dirname.split('/').pop();

// Create the thingShadow object with argument data
const device = awsIoT.device({
   keyPath: 'private.pem.key',
  certPath: 'certificate.pem.crt',
    caPath: '/home/ec2-user/environment/root-CA.crt',
  clientId: deviceName,
      host: endpointFile.endpointAddress
});

// Function that gets executed when the connection to IoT is established
device.on('connect', function() {
    console.log('Connected to AWS IoT');
    
    // Start the publish loop
    infiniteLoopPublish();
});

// Function sending car telemetry data every 10 seconds
function infiniteLoopPublish()
{
    console.log('[10s] Sending [' + deviceName + '] telemetry data to AWS IoT');
    // Publish car data to lab/telemetry topic with getCarData
    device.publish("lab/telemetry", JSON.stringify(getCarData(deviceName)));
    
    // Start Infinite Loop of Publish every 10 seconds
    setTimeout(infiniteLoopPublish, 10000);
}

// Function to create a random float between minValue and maxValue
function randomFloatBetween(minValue,maxValue)
{
    return parseFloat(Math.min(minValue + (Math.random() * (maxValue - minValue)),maxValue));
}

// Generate random car data based on the deviceName
function getCarData(deviceName)
{
    let message = {
        'trip_id': crypto.randomBytes(15).toString('hex'),
        'engine_speed_mean': randomFloatBetween(700.55555, 3000.55555),
        'fuel_level': randomFloatBetween(20, 100),
        'high_acceleration_event': randomFloatBetween(0, 12),
        'high_breaking_event': randomFloatBetween(0, 4),
        'odometer': randomFloatBetween(0.374318249, 8.142630049),
        'oil_temp_mean': randomFloatBetween(12.7100589, 205.3165256)
    };
    
    const device_data = { 
        'car1': {
            'vin': 'I5Z45ZSGBRZFU4YRM',
            'latitude':39.122229,
            'longitude':-77.133578
        },
        'car2': {
            'vin': 'ETWUASOOGRZOPQRTR',
            'latitude': 40.8173411,
            'longitude': -73.94332990000001
        }
    };
  
    message['vin'] = device_data[deviceName].vin;
    message['latitude'] = device_data[deviceName].latitude;
    message['longitude'] = device_data[deviceName].longitude;
    message['device'] = deviceName;
    message['datetime'] = new Date().toISOString().replace(/\..+/, '');
    
    return message;
}