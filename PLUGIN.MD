# Scanning Probe Plugin

## Overview

This plugin is to supplement the calibration of the Scanning Probe in order to aid temperature variation. For full documentation on the Scanning Probe, refer to the official duet website [on the Scanning Z Probe](https://docs.duet3d.com/en/Duet3D_hardware/Duet_3_family/Duet_3_Scanning_Z_Probe).

## Plugin installation

The **Scanning Probe plugin** requires you to be on a RRF version of 3.5.2 or above. It can be installed to perform temperature calibration and generate `G31` temperature coefficients for the probe.

To install the Scanning Probe plugin, download the [latest release version](https://github.com/markusyeo/ScanningProbePlugin/releases) as a .zip file and upload it using the `Install` button on DWC _without_ unpacking the file first. After this, you should see the `Plugins` category with a new `Scanning Probe` item in the main menu on the left:

![Plugin Illustration](/images/PluginIllustration.png)

Before you start temperature calibration, you should have run through the initial set up process for the scanning probe as outlined in [Scanning Z Probe Calibration](https://docs.duet3d.com/User_manual/Tuning/scanning_z_probe_calibration).

## Documentation

### Probe Chart

The plugin consists of a scanning probe chart which displays the scanning probe's values as it is currently. If Scan Coefficients are available, the chart will plot the appropriate height as according to the probe value being recorded. Refer to [Duet Scanning Z Probe Calibration](https://docs.duet3d.com/User_manual/Tuning/scanning_z_probe_calibration) guide before utilising the chart.

![Duet Scanning Probe Chart](/images/ProbeChart.png)

### Calibration Process

1. Before the calibration process, you will be prompted to home the printer. The first page will also display the available scanning probes on the printer.

![Scanning Probe Calibration](/images/ScanningProbeCalibration_1.png)

2. The next page will prompt you to select various config options for the calibration process. The options are as follows:

- **Probe**: Select the scanning probe you wish to calibrate.
- **Thermistor**: Select the thermistor that is attached to the scanning probe.
- **Tool**: Select the tool that the scanning probe is attached to.
- **Bed Heater**: Select the bed heater that will be used during the calibration process. Temperature Options:
  - **Start Temperature**: The starting temperature for the bed heater in the calibration process.
  - **Stop Temperature**: The stopping temperature for the bed heater in the calibration process.
  - **Step Temperature**: The step between each temperature increment in the calibration process.
- [Optional] **Chamber Heater**: Chamber heating is optional and can be selected if the printer has a chamber heater.
- [Optional] **Fans**: Fans can be selected for use during the calibration process to help circulate air around the printer. (This is helpful especially if the printer is enclosed).

![Scanning Probe Calibration](/images/ScanningProbeCalibration_2.png)

3. The final page will display the calibration process. The calibration will first execute `M558.1 K<probe> S0.5` to set scan coefficients to be used for the calibration. Then the tool will be set to the defined probe's trigger height. The bed and chamber will be heater to the defined temperatures computed from the provided start, stop and step temperatures set for the bed in the config page.

![Scanning Probe Calibration](/images/ScanningProbeCalibration_3.png)

4. During the calibration process, the plugin will display the current status between each temperature increment. There are 3 status symbols
   <!-- Heating symbol is currently heating to that temperature -->
   <!-- Clock is soaking at that temperature for 5 minutes -->
   <!-- Tick is completed step -->

- **Heating**: The bed is currently heating to the defined temperature.

![Heating](/images/Heating.png)

- **Soaking**: The bed is currently soaking at the defined temperature for 5 minutes.

![Soaking](/images/Soaking.png)

- **Completed**: The bed has completed the step and is ready to move to the next temperature increment.

![Completed](/images/Completed.png)

5. Upon completion of the calibration process, you will be prompted to download the JSON file containing the measured probe values. This file will be used later on to generate the `G31` temperature coefficients for the probe.

![Scanning Probe Calibration](/images/ScanningProbeCalibration_4.png)

### Generating Temperature Coefficients

1. To generate the temperature coefficients, you will need to upload the JSON file that was downloaded during the calibration process. The plugin will then generate the `G31` temperature coefficients for the probe.

![Scanning Probe Calibration](/images/UploadJSON.png)

The chart will compute the best fit line/curve for the probe values to be compensated from a base temperature. Refer to [G31 Documentation](https://docs.duet3d.com/User_manual/Reference/Gcodes/G31) for more information on the `G31` command and how to use the temperature coefficients.
