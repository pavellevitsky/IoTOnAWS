'''
* Copyright 2010-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License").
* You may not use this file except in compliance with the License.
* A copy of the License is located at
*
*  http://aws.amazon.com/apache2.0
*
* or in the "license" file accompanying this file. This file is distributed
* on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
* express or implied. See the License for the specific language governing
* permissions and limitations under the License.
'''

# Import the AWS IoT Device SDK
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient

# Import json for parson endpoint.json file
import json

# Import os for finding name of current directory
import os

# Load the endpoint from file
with open('..\endpoint.json') as json_file:  
    data = json.load(json_file)

# Fetch the deviceName from the current folder name
deviceName = os.path.split(os.getcwd())[1]

# Set the destinationDeviceName depending on this deviceName
if deviceName == 'car1':
    destinationDeviceName = 'car2'
else:
    destinationDeviceName = 'car1'

# Build useful variable for code
subTopic = 'lab/messaging/' + deviceName
pubTopic = 'lab/messaging/' + destinationDeviceName
keyPath = 'private.pem.key'
certPath = 'certificate.pem.crt'
caPath = 'C:/Users/USER/OneDrive/IoTOnAWS/root-CA.crt'
clientId = deviceName
host = data['endpointAddress']
port = 8883

exit_flag = False

# Use the AWSIoTMQTTClient library to create AWSIoTMQTTClient client and connect it to AWS IoT

myAWSIoTMQTTClient = AWSIoTMQTTClient (deviceName)
myAWSIoTMQTTClient.configureEndpoint (host, port)
myAWSIoTMQTTClient.configureCredentials (caPath, keyPath, certPath)
myAWSIoTMQTTClient.connect()

# This function will be called when a new message is received

def onMessageCallback (client, userdata, message):
    global exit_flag
    text = message.payload.decode()

    print("Message received on topic " + message.topic + " : " + text)

    if text == "bye":
        print('They say you BYE | Press ENTER to end the chat')
        exit_flag = True

# Subscribe to the subTopic IoT Topic and use above function as the callback

myAWSIoTMQTTClient.subscribe (subTopic, 1, onMessageCallback)

# Function to publish payload to IoT topic
def publishToIoTTopic (topic, payload):
    myAWSIoTMQTTClient.publish (topic, payload, 1)

# Infinite loop reading console input and publishing what it finds
while exit_flag is False:
    message = input('Enter a message to send to ' + pubTopic + ':\r\n')
    
    # Calling function to publish to IoT Topic
    publishToIoTTopic (pubTopic, message)
