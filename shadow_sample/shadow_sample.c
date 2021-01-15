#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <unistd.h>
#include <string.h>
#include <limits.h>

#include "aws_iot_config.h"
#include "aws_iot_log.h"
#include "aws_iot_version.h"
#include "aws_iot_mqtt_client_interface.h"
#include "aws_iot_shadow_interface.h"

/*!
 * The goal of this sample application is to demonstrate the capabilities of shadow.
 * This device reports temperature
 * It can report to the Shadow the following parameters:
 *  1. temperature (double)
 *  2. device status (READY, ACTIVE, HOLD, STOP)
 * It can act on commands from the cloud. In this case it will hold/resume/stop temperature reports based on the json object "state"
 *
 * The two variables from a device's perspective are double temperature and state enum
 The Json Document in the cloud will be
 {
   "reported": {
     "temperature": 0,
     "state": READY
   },
   "desired": {
     "state": READY
   }
 }
 */

#define HOST_ADDRESS_SIZE                255
#define MAX_LENGTH_OF_UPDATE_JSON_BUFFER 200
#define TEMPERATURE_UPPERLIMIT           32.0f
#define TEMPERATURE_LOWERLIMIT           25.0f
#define STARTING_TEMPERATURE             TEMPERATURE_LOWERLIMIT

enum deviceStates g_state_curr = ACTIVE;  // declare global var for current device state; initialise it to start with READY state
enum deviceStates g_state_prev = READY;  // declare global var for previous device state; initialise it to start with READY state

static char certDirectory[PATH_MAX + 1] = "../../../certs";      // certification files location
static char HostAddress[HOST_ADDRESS_SIZE] = AWS_IOT_MQTT_HOST;  // endpoint address (from AWS settings)

// this function will generate new temperature value between lower and upper limits
static void get_temperature (float *pTemperature)
{
	static float deltaChange;

	// simulate no measurement change scenarion; only each 4th measurements (statistically) are reported
	if (rand() % 4)
	{
		return;
	}

	if (*pTemperature >= TEMPERATURE_UPPERLIMIT)
	{
		deltaChange = -0.5f;
	}
	else if (*pTemperature <= TEMPERATURE_LOWERLIMIT)
	{
		deltaChange = 0.5f;
	}

	*pTemperature += deltaChange;
}

// this callback is called on shadow ack and will display its status
static void ShadowUpdateStatusCallback
			(const char          *pThingName,
			 ShadowActions_t      action,
			 Shadow_Ack_Status_t  status,
			 const char          *pReceivedJsonDocument,
			 void                *pContextData)
{
	IOT_UNUSED(pThingName);
	IOT_UNUSED(action);
	IOT_UNUSED(pReceivedJsonDocument);
	IOT_UNUSED(pContextData);

	if (SHADOW_ACK_TIMEOUT == status)
	{
		IOT_INFO("SHADOW_ACK_TIMEOUT");
	}
	else if (SHADOW_ACK_REJECTED == status)
	{
		IOT_INFO("SHADOW_ACK_REJECTED");
	}
	else if (SHADOW_ACK_ACCEPTED == status)
	{
		IOT_INFO("SHADOW_ACK_ACCEPTED");
	}
}

// callback function for shadow updates (not called in case of no change)
static void state_update_callback (const char *pJsonString, uint32_t JsonStringDataLen, jsonStruct_t *pContext)
{
	IOT_UNUSED(pJsonString);
	IOT_UNUSED(JsonStringDataLen);

	if (pContext != NULL)
	{
		int state = atoi(&pJsonString[9]);  // retrieve state value (TODO change)
		
		if ((state == READY) || (state == ACTIVE) ||(state == HOLD) ||(state == STOP))
		{
			g_state_curr = state;
			IOT_INFO("\n**********************************");
			IOT_INFO("**  Delta | state changed to %d  **", g_state_curr);
			IOT_INFO("**********************************\n");
		}
		else
		{
			IOT_INFO("Delta | ignore invalid state %d", state);  // ignore invalid values
		}
	}
}

int main (int argc, char **argv)
{
	IoT_Error_t rc = FAILURE;
	float curr_temperature = STARTING_TEMPERATURE;
	float last_temperature = STARTING_TEMPERATURE;
	char rootCA[PATH_MAX + 1];
	char clientCRT[PATH_MAX + 1];
	char clientKey[PATH_MAX + 1];
	char CurrentWD[PATH_MAX + 1];
	char JsonDocumentBuffer[MAX_LENGTH_OF_UPDATE_JSON_BUFFER];
	size_t sizeOfJsonDocumentBuffer = sizeof(JsonDocumentBuffer) / sizeof(JsonDocumentBuffer[0]);
	jsonStruct_t    windowActuator;
	jsonStruct_t    temperatureHandler;
	AWS_IoT_Client  mqttClient;
	ShadowInitParameters_t     sp = ShadowInitParametersDefault;
	ShadowConnectParameters_t scp = ShadowConnectParametersDefault;

	// fill a struct for shadow register delta
	windowActuator.cb = state_update_callback;
	windowActuator.type = SHADOW_JSON_INT8;
	windowActuator.pKey = "state";
	windowActuator.pData = &g_state_curr;
	windowActuator.dataLength = sizeof(int);

	// fill a struct for shadow reported content
	temperatureHandler.cb = NULL;
	temperatureHandler.type = SHADOW_JSON_FLOAT;
	temperatureHandler.pKey = "temperature";
	temperatureHandler.pData = &curr_temperature;
	temperatureHandler.dataLength = sizeof(float);

	IOT_INFO("\nAWS IoT SDK Version %d.%d.%d\n", VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH);

	// build certification files path
	snprintf(rootCA, PATH_MAX + 1, "%s/%s", certDirectory, AWS_IOT_ROOT_CA_FILENAME);
	snprintf(clientCRT, PATH_MAX + 1, "%s/%s", certDirectory, AWS_IOT_CERTIFICATE_FILENAME);
	snprintf(clientKey, PATH_MAX + 1, "%s/%s", certDirectory, AWS_IOT_PRIVATE_KEY_FILENAME);

	IOT_DEBUG("rootCA    : %s", rootCA);
	IOT_DEBUG("clientCRT : %s", clientCRT);
	IOT_DEBUG("clientKey : %s\n", clientKey);

	// initialize the MQTT client
	sp.pHost      = HostAddress;
	sp.port       = AWS_IOT_MQTT_PORT;
	sp.pClientCRT = clientCRT;
	sp.pClientKey = clientKey;
	sp.pRootCA    = rootCA;
	sp.enableAutoReconnect = false;
	sp.disconnectHandler = NULL;

	IOT_INFO("Shadow Init\n");

	if (rc = aws_iot_shadow_init (&mqttClient, &sp) != SUCCESS)
	{
		IOT_ERROR("Shadow Connection Error | rc:%d", rc);
		return rc;
	}

	scp.pMyThingName = AWS_IOT_MY_THING_NAME;
	scp.pMqttClientId = AWS_IOT_MQTT_CLIENT_ID;
	scp.mqttClientIdLen = (uint16_t) strlen(AWS_IOT_MQTT_CLIENT_ID);

	IOT_INFO("Shadow Connect\n");

	if (rc = aws_iot_shadow_connect (&mqttClient, &scp) != SUCCESS)
	{
		IOT_ERROR("Shadow Connection Error | rc:%d", rc);
		return rc;
	}

	IOT_INFO("Set AUTO RECONNECT\n");

	if (rc = aws_iot_shadow_set_autoreconnect_status (&mqttClient, true) != SUCCESS)
	{
		IOT_ERROR("Unable to set Auto Reconnect | rc:%d", rc);
		return rc;
	}

	IOT_INFO("Shadow Register Delta\n");

	if (rc = aws_iot_shadow_register_delta (&mqttClient, &windowActuator) != SUCCESS)
	{
		IOT_ERROR("Shadow Register Delta Error | rc:%d", rc);
	}

	IOT_INFO("Current state: %d [0-READY 1-ACTIVE 2-HOLD 3-STOP]\n", g_state_curr);

	// Main loop: read current temperature and publish it in ACTIVE state only

	while ((g_state_curr != STOP) && ((NETWORK_ATTEMPTING_RECONNECT == rc) || (NETWORK_RECONNECTED == rc) || (SUCCESS == rc)))
	{
		rc = aws_iot_shadow_yield (&mqttClient, 200);

		// waiting for ACTIVE state, or reconnection; still need to update state in shadow reported
		if ((g_state_curr == READY) || (g_state_curr == HOLD) || (NETWORK_ATTEMPTING_RECONNECT == rc))
		{
			// Update shadow on state change only
			if (g_state_curr != g_state_prev)
			{
				rc = aws_iot_shadow_init_json_document (JsonDocumentBuffer, sizeOfJsonDocumentBuffer);
				
				rc = aws_iot_shadow_add_reported (JsonDocumentBuffer, sizeOfJsonDocumentBuffer, 2, &temperatureHandler, &windowActuator);
	
				rc = aws_iot_finalize_json_document (JsonDocumentBuffer, sizeOfJsonDocumentBuffer);
	
				IOT_INFO("[continue] Update Shadow: %s", JsonDocumentBuffer);
	
				rc = aws_iot_shadow_update (&mqttClient, AWS_IOT_MY_THING_NAME, JsonDocumentBuffer, ShadowUpdateStatusCallback, NULL, 4, true);

				g_state_prev = g_state_curr;  // keep new state
			}

			sleep(1);
			continue;  // jump to the loop entry
		}

		get_temperature (&curr_temperature);  // read current temperature (real or simulated)
		
		// skip publishing while no change in measurements
		if (curr_temperature == last_temperature)
		{
			sleep(1);
			continue;  // jump to the loop entry
		}

		last_temperature = curr_temperature;  // keep current measurement

		if (rc = aws_iot_shadow_init_json_document (JsonDocumentBuffer, sizeOfJsonDocumentBuffer) == SUCCESS)
		{
			if (rc = aws_iot_shadow_add_reported (JsonDocumentBuffer, sizeOfJsonDocumentBuffer, 2, &temperatureHandler, &windowActuator) == SUCCESS)
			{
				if (rc = aws_iot_finalize_json_document (JsonDocumentBuffer, sizeOfJsonDocumentBuffer) == SUCCESS)
				{
					IOT_INFO("[loop] Update Shadow : %s", JsonDocumentBuffer);

					rc = aws_iot_shadow_update (&mqttClient, AWS_IOT_MY_THING_NAME, JsonDocumentBuffer, ShadowUpdateStatusCallback, NULL, 4, true);
				}
			}
		}

		sleep(1);
	}

	if (SUCCESS != rc)
	{
		IOT_ERROR("An error occurred in the loop | rc:%d", rc);
	}

	g_state_curr = READY;

	if (rc = aws_iot_shadow_init_json_document (JsonDocumentBuffer, sizeOfJsonDocumentBuffer) == SUCCESS)
	{
		if (rc = aws_iot_shadow_add_reported (JsonDocumentBuffer, sizeOfJsonDocumentBuffer, 2, &temperatureHandler, &windowActuator) == SUCCESS)
		{
			if (rc = aws_iot_finalize_json_document (JsonDocumentBuffer, sizeOfJsonDocumentBuffer) == SUCCESS)
			{
				IOT_INFO("[exit] Update Shadow : %s", JsonDocumentBuffer);

				rc = aws_iot_shadow_update (&mqttClient, AWS_IOT_MY_THING_NAME, JsonDocumentBuffer, ShadowUpdateStatusCallback, NULL, 4, true);
			}
		}
	}

	IOT_INFO("\n*********************************");
	IOT_INFO("**  Disconnecting from Shadow  **");
	IOT_INFO("*********************************");

	if (aws_iot_shadow_disconnect (&mqttClient) != SUCCESS)
	{
		IOT_ERROR("Disconnect error | rc:%d", rc);
	}

	return rc;
}
