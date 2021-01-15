// Browser based Thing Shadow Updater

// Instantiate the AWS SDK and configuration objects.  The AWS SDK for 
// JavaScript (aws-sdk) is used for Cognito Identity/Authentication, and 
// the AWS IoT SDK for JavaScript (aws-iot-device-sdk) is used for the
// WebSocket connection to AWS IoT and device shadow APIs.

var AWS = require('aws-sdk');
var AWSIoTData = require('aws-iot-device-sdk');

// Set Thing name constant
const car1_thingName = "car1";
const car2_thingName = "car2";

// Initialize the configuration.
AWS.config.region = AWSConfiguration.region;
AWS.config.credentials = new AWS.CognitoIdentityCredentials({ IdentityPoolId: AWSConfiguration.poolId });

// Global Variables
// Keep track of the light status from the webpage perspective
var car1_currentLightStatus;
var car2_currentLightStatus;

// Keep track of whether or not we've registered the shadows used by this example.
var car1_shadowsRegistered = false;
var car2_shadowsRegistered = false;

// Attempt to authenticate to the Cognito Identity Pool.
var cognitoIdentity = new AWS.CognitoIdentity();

AWS.config.credentials.get(
function (err, data)
{
    if (!err)
    {
        console.log('retrieved identity from Cognito: ' + AWS.config.credentials.identityId);
        var params = { IdentityId: AWS.config.credentials.identityId };

        cognitoIdentity.getCredentialsForIdentity(params, function (err, data)
        {
            if (!err)
            {
                // Create the AWS IoT shadows object.

                const car1_thingShadows = AWSIoTData.thingShadow({
                    region: AWS.config.region,        // Set the AWS region we will operate in
                    host: AWSConfiguration.endpoint,  // Set the AWS IoT Host Endpoint
                    clientId: car1_thingName + '-' + (Math.floor((Math.random() * 100000) + 1)),  // Use a random client ID
                    protocol: 'wss',                  // Connect via secure WebSocket
                    // Set the maximum reconnect time to 8 seconds; this is a browser application
                    // so we don't want to leave the user waiting too long for re-connection after
                    // re-connecting to the network/re-opening their laptop/etc...
                    maximumReconnectTimeMs: 8000,
                    // Set Access Key, Secret Key and session token based on credentials from Cognito
                    accessKeyId: data.Credentials.AccessKeyId,
                    secretKey: data.Credentials.SecretKey,
                    sessionToken: data.Credentials.SessionToken
                });

                const car2_thingShadows = AWSIoTData.thingShadow({
                    region: AWS.config.region,        // Set the AWS region we will operate in
                    host: AWSConfiguration.endpoint,  // Set the AWS IoT Host Endpoint
                    clientId: car2_thingName + '-' + (Math.floor((Math.random() * 100000) + 1)),
                    protocol: 'wss',                  // Connect via secure WebSocket
                    maximumReconnectTimeMs: 8000,
                    accessKeyId: data.Credentials.AccessKeyId,
                    secretKey: data.Credentials.SecretKey,
                    sessionToken: data.Credentials.SessionToken
                });

                // Update car image whenever we receive status events from the shadows.
                car1_thingShadows.on('status',
                function (car1_thingName, statusType, clientToken, stateObject)
                {
                    console.log('status event received for my own operation')
                    if (statusType === 'rejected')
                    {
                        // If an operation is rejected it is likely due to a version conflict;
                        // request the latest version so that we synchronize with the shadow
                        // The most notable exception to this is if the thing shadow has not
                        // yet been created or has been deleted.
                        if (stateObject.code !== 404)
                        {
                            console.log('re-sync with thing shadow');
                            var opClientToken = car1_thingShadows.get(car1_thingName);

                            if (opClientToken === null)
                            {
                                console.log('operation in progress');
                            }
                        }
                    }
                    else  // statusType === 'accepted'
                    {
                        if (stateObject.state.hasOwnProperty('reported') && stateObject.state.reported.hasOwnProperty('lights'))
                        {
                            document.getElementById('car1_step_3').innerHTML = '<font color=green>Status received</font>';

                            car1_handleImage(stateObject.state.reported.lights);
                        }
                    }
                });

                car2_thingShadows.on('status',
                function (car2_thingName, statusType, clientToken, stateObject)
                {
                    console.log('status event received for my own operation')
                    if (statusType === 'rejected')
                    {
                        if (stateObject.code !== 404)
                        {
                            console.log('re-sync with thing shadow');
                            var opClientToken = car2_thingShadows.get(car2_thingName);

                            if (opClientToken === null)
                            {
                                console.log('operation in progress');
                            }
                        }
                    }
                    else  // statusType === 'accepted'
                    {
                        if (stateObject.state.hasOwnProperty('reported') && stateObject.state.reported.hasOwnProperty('lights'))
                        {
                            document.getElementById('car2_step_3').innerHTML = '<font color=green>Status received</font>';

                            car2_handleImage(stateObject.state.reported.lights);
                        }
                    }
                });

                // Update car image whenever we receive foreignStateChange events from the shadow.
                // This is triggered when the car Thing updates its state.
                car1_thingShadows.on('foreignStateChange',
                function (car1_thingName, operation, stateObject)
                {
                    console.log('foreignStateChange event received')
                    
                    // If the operation is an update
                    if (operation === "update")
                    {
                        // Make sure the lights property exists
                        if (stateObject.state.hasOwnProperty('reported') && stateObject.state.reported.hasOwnProperty('lights'))
                        {
                            car1_handleImage(stateObject.state.reported.lights);
                        }
                        else
                        {
                            console.log('no reported lights state');
                        }
                    }
                });

                car2_thingShadows.on('foreignStateChange',
                function (car2_thingName, operation, stateObject)
                {
                    console.log('foreignStateChange event received')
                    
                    // If the operation is an update
                    if (operation === "update")
                    {
                        // Make sure the lights property exists
                        if (stateObject.state.hasOwnProperty('reported') && stateObject.state.reported.hasOwnProperty('lights'))
                        {
                            car2_handleImage(stateObject.state.reported.lights);
                        }
                        else
                        {
                            console.log('no reported lights state');
                        }
                    }
                });

                // Connect handler; update visibility and fetch latest shadow documents. Register shadows on the first connect event.

                car1_thingShadows.on('connect',
                function ()
                {
                    console.log('connect event received');

                    document.getElementById('car1_step_1').innerHTML = '<font color=green>Connected to AWS IoT</font>';

                    // We only register the shadow once.
                    if (!car1_shadowsRegistered)
                    {
                        car1_thingShadows.register(car1_thingName, {},
                        function (err, failedTopics)
                        {
                            if (!err)
                            {                    
                                console.log(car1_thingName + ' has been registered');

                                document.getElementById('car1_step_2').innerHTML = '<font color=green>Registered to Shadow</font>';

                                // Fetch the initial state of the Shadow
                                var opClientToken = car1_thingShadows.get(car1_thingName);
                                if (opClientToken === null)
                                {
                                    console.log('operation in progress');
                                }
                                car1_shadowsRegistered = true;
                            }
                        });
                    }
                });

                car2_thingShadows.on('connect',
                function ()
                {
                    console.log('connect event received');

                    document.getElementById('car2_step_1').innerHTML = '<font color=green>Connected to AWS IoT</font>';

                    if (!car2_shadowsRegistered)
                    {
                        car2_thingShadows.register(car2_thingName, {},
                        function (err, failedTopics)
                        {
                            if (!err)
                            {                    
                                console.log(car2_thingName + ' has been registered');

                                document.getElementById('car2_step_2').innerHTML = '<font color=green>Registered to Shadow</font>';

                                // Fetch the initial state of the Shadow
                                var opClientToken = car2_thingShadows.get(car2_thingName);
                                if (opClientToken === null)
                                {
                                    console.log('operation in progress');
                                }
                                car2_shadowsRegistered = true;
                            }
                        });
                    }
                });

                // When the Button is clicked, update the Thing Shadow with the inverse of the current light status

                const Car1LightsEventButton = document.getElementById('Car1LightsEventButton');
                Car1LightsEventButton.addEventListener('click', (evt) => {
                    car1_thingShadows.update(car1_thingName, { state: { desired: { lights: !car1_currentLightStatus } } });
                });

                const Car2LightsEventButton = document.getElementById('Car2LightsEventButton');
                Car2LightsEventButton.addEventListener('click', (evt) => {
                    car2_thingShadows.update(car2_thingName, { state: { desired: { lights: !car2_currentLightStatus } } });
                });
            }
            else
            {
                console.log('error retrieving credentials: ' + err);
                alert('Error retrieving credentials: ' + err);
            }
        });
    }
    else
    {
        console.log('error retrieving identity:' + err);
        alert('Error retrieving identity: ' + err);
    }
});

 // Function handling the car image based on the newLightStatus
function car1_handleImage(newLightStatus)
{
    if (car1_currentLightStatus === newLightStatus)
    {
        return;
    }

    console.log('changing car image');

    if (newLightStatus === true)
    {
        document.getElementById("car1_image").src = "images/car-with-lights.png";
        document.getElementById("car1_lights").innerHTML = '<big><font color=green>The lights are ON</big>';
    }
    else
    {
        document.getElementById("car1_image").src = "images/car-no-lights.png";
        document.getElementById("car1_lights").innerHTML = '<big><font color=red>The lights are OFF</big>';
    }

    car1_currentLightStatus = newLightStatus;
}

function car2_handleImage(newLightStatus)
{
    if (car2_currentLightStatus === newLightStatus)
    {
        return;
    }

    console.log('changing car image');

    if (newLightStatus === true)
    {
        document.getElementById("car2_image").src = "images/car-with-lights.png";
        document.getElementById('car2_lights').innerHTML = '<big><font color=green>The lights are ON</big>';
    }
    else
    {
        document.getElementById("car2_image").src = "images/car-no-lights.png";
        document.getElementById('car2_lights').innerHTML = '<big><font color=red>The lights are OFF</big>';
    }

    car2_currentLightStatus = newLightStatus;
}
