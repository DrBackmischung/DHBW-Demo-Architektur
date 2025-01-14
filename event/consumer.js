import amqp from 'amqplib';
import { cloudLogin, loginDevice } from "tp-link-tapo-connect";

const email = ''
const password = ''
const deviceIdToFind = '';

const cloudApi = await cloudLogin(email, password);

const devices = await cloudApi.listDevicesByType('SMART.TAPOBULB');
console.log("Devices:", devices);

const targetDevice = devices.find(device => device.deviceId === deviceIdToFind);

const lampState = {
  poweredOn: false,
  brightness: 100,
  color: 'unknown',
};

let device = null;

if (!targetDevice) {
    console.log(`Device with id "${deviceIdToFind}" not found!`);
} else {
    device = await loginDevice(email, password, targetDevice);
    const deviceInfo = await device.getDeviceInfo();
    console.log('Device info:', deviceInfo);
    lampState.poweredOn = deviceInfo.device_on;
    lampState.brightness = deviceInfo.brightness;
    lampState.color = 'unknown';

    consumeLampCommands();
}

async function consumeLampCommands() {
  const queueName = 'lamp-commands';

  try {
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();

    await channel.assertQueue(queueName, { durable: false });
    console.log('[*] Waiting for messages in:', queueName);

    channel.consume(queueName, async (msg) => {
      if (msg !== null) {
        const rawValue = msg.content.toString();
        let cmd;
        try {
          cmd = JSON.parse(rawValue);
          console.log("JSON", cmd)
        } catch (err) {
          console.error('Invalid JSON message:', rawValue);
          channel.ack(msg);
          return;
        }

        switch (cmd.command) {
          case 'on':
            lampState.poweredOn = true;
            await device.turnOn();
            console.log('Lamp is now ON');
            break;
          case 'off':
            lampState.poweredOn = false;
            await device.turnOff();
            console.log('Lamp is now OFF');
            break;
          case 'brightness':
            if (
              typeof cmd.value === 'number' &&
              cmd.value >= 0 &&
              cmd.value <= 100
            ) {
              lampState.brightness = cmd.value;
              await device.setBrightness(cmd.value);
              console.log(`Lamp brightness set to ${cmd.value}`);
            } else {
              console.log('Brightness must be a number between 0 and 100.');
            }
            break;
          case 'color':
            const validColors = ['red', 'yellow', 'green', 'blue', 'white'];
            if (validColors.includes(cmd.value)) {
              lampState.color = cmd.value;
              await device.setColour(cmd.value);
              console.log(`Lamp color set to ${cmd.value}`);
            } else {
              console.log(`Invalid color. Choose from: ${validColors.join(', ')}`);
            }
            break;
          default:
            console.log(`Unknown command: ${cmd.command}`);
            break;
        }
        channel.ack(msg);
        console.log("Current state:", lampState);
      }
    });
  } catch (error) {
    console.error('Error in consumer:', error);
  }
}
