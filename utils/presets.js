/**
 * Starter configurations for common device types.
 *
 * Presets only fill metadata and, optionally, starter dashboard cards. They do
 * not add firmware code: the generated project stays a normal Vuesp template.
 */
export const PRESETS = {
  bms: {
    label: 'BMS · battery',
    board: 'esp32-c3-devkitm-1',
    platforms: ['ESP32-C3'],
    tags: ['bms', 'battery', 'esp32-c3'],
    summary: 'Battery monitoring and management with a local web interface',
    description: [
      'A Vuesp project for a battery management system: cell voltages, current, power,',
      'temperature and protection states.',
      '',
      'Wire the values from your BMS protocol to the `device.*` fields and update the',
      'dashboard cards in `vue/json/dashboard.json`.',
    ].join('\n'),
    dashboard: [
      { id: 'device.voltage', name: 'Voltage', type: 'info', icon: 'battery-2', args: ['device.voltage'], getTo: '`${v} V`' },
      { id: 'device.current', name: 'Current', type: 'info', icon: 'light', args: ['device.current'], getTo: '`${v} A`' },
      { id: 'device.soc', name: 'SOC', type: 'info', icon: 'store', args: ['device.soc'], getTo: '`${v}%`' },
      { id: 'device.temperature', name: 'Temperature', type: 'info', icon: 'therm', args: ['device.temperature'], getTo: '`${v} °C`' },
    ],
    note: 'BMS preset: the dashboard contains starter cards for voltage, current, SOC and temperature. Update them after wiring your BMS protocol.',
  },
  camera: {
    label: 'Camera',
    board: 'esp32',
    platforms: ['ESP32'],
    tags: ['camera', 'video', 'esp32'],
    summary: 'Camera device with a local web interface',
    description: [
      'A Vuesp project for a camera or video device with a local web interface.',
      '',
      'Use the camera module of your firmware or connect the device to `vuesp-hub` for',
      'RTSP/MJPEG streams and recording.',
    ].join('\n'),
    dashboard: [],
    note: 'Camera preset: add the camera module to the firmware or connect the project to vuesp-hub for video streams.',
  },
  led: {
    label: 'LED · lighting',
    board: 'esp32',
    platforms: ['ESP32'],
    tags: ['led', 'light', 'pwm', 'esp32'],
    summary: 'LED lighting control with PWM and a local web interface',
    description: [
      'A Vuesp project for LED strips, lamps or matrix panels.',
      '',
      'The starter dashboard contains GPIO 12 and 13 buttons and a PWM dimmer on GPIO 14.',
      'Change the pins in `vue/json/dashboard.json` and in the GPIO settings.',
    ].join('\n'),
    dashboard: [
      { id: 'ports.12', name: 'Light 1', type: 'button', icon: 'bulb', args: ['ports.12.value', 'ports.12'], set: '({ ...a, value: v, command: 2})', getTo: "v ? 'ON' : 'OFF'" },
      { id: 'ports.13', name: 'Light 2', type: 'button', icon: 'bulb', args: ['ports.13.value', 'ports.13'], set: '({ ...a, value: v, command: 2})', getTo: "v ? 'ON' : 'OFF'" },
      { id: 'ports.14', name: 'Dimmer', type: 'dimmer', icon: 'windy', args: ['ports.14.value', 'ports.14'], set: '({ ...a, value: v, command: 2})', getTo: 'v' },
    ],
    replaceDashboardIds: ['ports.12', 'ports.13', 'ports.14'],
    note: 'LED preset: GPIO 12/13 are buttons and GPIO 14 is a PWM dimmer. Adjust the pins for your board.',
  },
};

export const presetNames = Object.keys(PRESETS);

/**
 * Resolves a preset by name.
 *
 * @param {string} name
 * @returns {(typeof PRESETS)[keyof typeof PRESETS]}
 */
export const getPreset = (name) => {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(`Unknown preset "${name}". Available presets: ${presetNames.join(', ')}`);
  }
  return preset;
};
