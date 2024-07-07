<style>
.centered-alert > div {
  align-items: center;
}
.centered-alert > div > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.underlined-link {
  color: darkblue;
  text-decoration: none;
}
.underlined-link:hover {
  text-decoration: underline;
}
.v-alert.info a {
  color: darkblue;
  text-decoration: underline;
}
</style>

<template>
  <v-dialog v-model="shownInternal" max-width="640px" no-click-animation>
    <v-card>
      <v-card-title>
        <span class="headline">Calibrate Scanning Probe</span>
      </v-card-title>

      <v-card-text class="pb-0">
        <v-window v-model="currentPage">
          <!-- Start -->
          <v-window-item value="start">
            This wizard lets you calibrate your Duet scanning probe by using the
            thermistor attached to the coil.<br />
            <v-alert type="info">
              Refer to
              <a
                href="https://docs.duet3d.com/en/Duet3D_hardware/Duet_3_family/Duet_3_Scanning_Z_Probe"
                target="_blank"
                class="underlined-link"
                >Duet Documentation on Scanning Probe</a
              >
              for more information.
            </v-alert>
            <!-- List available scanning probes and their coefficients -->
            <div v-if="scanningProbes.length > 0">
              <ul class="mt-3 mb-4">
                <li v-for="probe in scanningProbes" :key="probe.id">
                  <strong>Scanning Probe: Index #{{ probe.id }}</strong>
                  <ul>
                    <li>
                      Current temp coefficients:
                      {{ probe.temperatureCoefficients }}
                    </li>
                    <li>
                      Current calibration temp:
                      {{ probe.calibrationTemperature }}
                    </li>
                  </ul>
                </li>
              </ul>
            </div>
            <div v-if="scanningProbes.length > 0 && !allAxesHomed">
              <v-alert
                :value="!allAxesHomed"
                dense
                text
                border="left"
                type="warning"
                class="centered-alert my-3"
              >
                Machine is not homed
                <code-btn code="G28" color="warning" small class="float-right">
                  Home All
                </code-btn>
              </v-alert>
            </div>

            <div v-if="hasMultipleScanningProbes">
              <v-alert
                dense
                text
                border="left"
                type="info"
                class="centered-alert my-3"
              >
                This machine has multiple scanning probes. If you are operating
                a tool changer, you will need to calibrate each scanning probe
                separately.
              </v-alert>
            </div>

            <div v-if="scanningProbes.length === 0">
              <v-alert
                dense
                text
                border="left"
                type="error"
                class="centered-alert my-3"
              >
                No scanning probe found!
              </v-alert>
            </div>

            <div v-if="scanningProbes.length > 0 && allAxesHomed">
              <v-alert
                dense
                text
                border="left"
                type="success"
                class="centered-alert my-3"
              >
                Ready to calibrate scanning probe!
              </v-alert>
              <span v-show="scanningProbes.length > 0"
                >Press Next to continue.</span
              >
            </div>
          </v-window-item>

          <!-- Configuration -->
          <v-window-item value="config">
            <div class="d-flex flex-column">
              Set up parameters for the calibration process.
              <br />
              <div>
                <div class="text-subtitle-1 mt-3">
                  Select the scanning probe to calibrate
                </div>
                <v-row>
                  <v-col>
                    <v-select
                      v-model="calibrationParams.selectedScanningProbe"
                      :items="
                        scanningProbes.map((probe) => ({
                          text: `Probe #${probe.id}`,
                          probe: probe,
                        }))
                      "
                      item-text="text"
                      item-value="probe"
                      label="Select Scanning Probe"
                      class="mb-3"
                      hide-details
                      :rules="scanningProbeIsRequired"
                    ></v-select>
                  </v-col>
                  <v-col>
                    <v-select
                      v-model="calibrationParams.selectedThermistor"
                      :items="thermistors"
                      item-text="text"
                      item-value="thermistor"
                      label="Select Scanning Probe Thermistor"
                      class="mb-1"
                      hide-details
                      :rules="thermistorIsRequired"
                    ></v-select>
                  </v-col>
                </v-row>
                <v-row>
                  <v-col>
                    <div class="text-subtitle-1">
                      Select the tool to which the scanning probe is attached
                    </div>
                    <v-select
                      v-model="calibrationParams.selectedTool"
                      :items="toolList"
                      item-text="text"
                      item-value="tool"
                      label="Select Scanning Probe Tool"
                      class="mb-3"
                      hide-details
                      :rules="toolIsRequired"
                    ></v-select>
                  </v-col>
                </v-row>
              </div>
              <div>
                <v-simple-table class="mt-3">
                  <thead>
                    <tr>
                      <th class="pl-0">Heater</th>
                      <th style="width: 20%">Start (°C)</th>
                      <th style="width: 20%">Stop (°C)</th>
                      <th style="width: 20%" class="pr-0">Step (°C)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr index="bedHeater">
                      <td class="px-0">
                        <v-select
                          v-model="calibrationParams.selectedBedHeater"
                          :items="
                            bedHeaters.map((heater) => ({
                              text: heater.name,
                              heater: heater,
                            }))
                          "
                          item-text="text"
                          item-value="heater"
                          label="Bed Heater"
                          class="pt-0"
                          hide-details
                        ></v-select>
                      </td>
                      <td style="width: 20%">
                        <v-text-field
                          v-model="calibrationParams.bedHeaterStart"
                          type="number"
                          :min="0"
                          :max="getHeaterMaxTemp(selectedBedHeater)"
                          :label="getBedHeaterStartLabel()"
                          class="pt-0"
                          hide-details
                          :rules="
                            startTempRules(getHeaterMaxTemp(selectedBedHeater))
                          "
                        ></v-text-field>
                      </td>
                      <td style="width: 20%">
                        <v-text-field
                          v-model="calibrationParams.bedHeaterStop"
                          type="number"
                          :min="calibrationParams.bedHeaterStart"
                          :max="getHeaterMaxTemp(selectedBedHeater)"
                          :label="getBedHeaterStopLabel()"
                          class="pt-0"
                          hide-details
                          :rules="
                            stopTempRules(
                              calibrationParams.bedHeaterStart,
                              getHeaterMaxTemp(selectedBedHeater)
                            )
                          "
                        ></v-text-field>
                      </td>
                      <td style="width: 20%">
                        <v-text-field
                          v-model="calibrationParams.bedHeaterStep"
                          type="number"
                          class="pt-0"
                          hide-details
                          :rules="stepTempRules"
                        ></v-text-field>
                      </td>
                    </tr>
                  </tbody>
                </v-simple-table>
              </div>
              <v-divider class="mt-3" />
              <v-checkbox
                v-model="showChamberHeatersConfig"
                label="Add a Chamber Heater to the calibration process"
                :disabled="
                  !showChamberHeatersConfig && chamberHeaterIds.length === 0
                "
              ></v-checkbox>
              <div v-if="showChamberHeatersConfig">
                <v-row>
                  <v-col>
                    <v-text-field
                      v-model="calibrationParams.chamberHeaterStart"
                      type="number"
                      label="Start Temperature (°C)"
                      hide-details
                      :min="0"
                      :max="getChamberHeaterMaxTemp()"
                      :rules="startTempRules(getChamberHeaterMaxTemp())"
                    />
                  </v-col>
                  <v-col>
                    <v-text-field
                      v-model="calibrationParams.chamberHeaterStop"
                      type="number"
                      label="Stop Temperature (°C)"
                      hide-details
                      :min="calibrationParams.chamberHeaterStart"
                      :max="getChamberHeaterMaxTemp()"
                      :rules="
                        stopTempRules(
                          calibrationParams.chamberHeaterStart,
                          getChamberHeaterMaxTemp()
                        )
                      "
                    />
                  </v-col>
                </v-row>
              </div>
              <div>
                <v-alert type="warning" border="left" text dense>
                  You should enclose your printer if possible to help simulate
                  higher probe temperatures.
                </v-alert>
              </div>
              <v-divider class="mx-auto" />
              <v-checkbox
                v-model="showFanConfig"
                label="Add a Fan to the calibration process"
                :disabled="!showFanConfig && availableFans().length === 0"
              ></v-checkbox>
              <div v-if="showFanConfig">
                <v-simple-table class="mt-1">
                  <thead>
                    <tr>
                      <th class="pl-0">Fan</th>
                      <th style="width: 20%">Speed</th>
                      <th style="width: 10%" class="pr-0"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(fan, index) in calibrationParams.fans"
                      :key="`fan-${index}`"
                    >
                      <td class="pl-0">
                        <v-select
                          v-model="fan.id"
                          :items="availableFansFor(fan)"
                          :item-text="
                            (fan) => fan.item.name ?? `Fan ${fan.item.id}`
                          "
                          item-value="id"
                          label="Select Fan"
                          class="pt-0"
                          hide-details
                        />
                      </td>
                      <td>
                        <v-text-field
                          v-model.number="fan.speed"
                          type="number"
                          :min="0"
                          :max="255"
                          label="[0-255]"
                          class="pt-0"
                          hide-details
                        />
                      </td>
                      <td class="pr-0">
                        <v-btn icon color="warning" @click="removeFan(index)">
                          <v-icon>mdi-close</v-icon>
                        </v-btn>
                      </td>
                    </tr>
                  </tbody>
                </v-simple-table>
                <v-btn
                  color="blue darken-1"
                  class="px-3 mt-3 mb-3"
                  outlined
                  text
                  @click="addFan"
                >
                  <v-icon class="mr-1">mdi-plus</v-icon>
                  Add Fan
                </v-btn>
              </div>
              <v-divider class="mx-auto" />
              <v-alert dense border="left" text>
                The machine will calculate new temperature coefficients as soon
                as Next is clicked.
              </v-alert>
            </div>
          </v-window-item>

          <!-- Data Collection -->
          <v-window-item value="calibration">
            <v-container>
              <div v-if="!calibrationFinished">
                <v-alert
                  v-if="!calibrationStarted"
                  :value="!allAxesHomed"
                  border="left"
                  dense
                  text
                  :type="allAxesHomed ? 'success' : 'warning'"
                  class="centered-alert my-3"
                >
                  Machine is not homed! Home it before starting calibration.
                  <code-btn
                    code="G28"
                    color="warning"
                    small
                    class="float-right"
                  >
                    Home All
                  </code-btn>
                </v-alert>
                <h2>Calibration</h2>
                <v-row>
                  <v-col cols="12">
                    <v-simple-table class="calibration-table">
                      <tbody>
                        <tr></tr>
                        <tr>
                          <td>Elapsed Time</td>
                          <td>
                            {{ formatTime(calibrationProgress.timeElapsed) }}
                          </td>
                          <td>Probe Value</td>
                          <td>{{ getScanningProbeValue }}</td>
                        </tr>
                        <tr>
                          <td>Bed Temp</td>
                          <td>{{ getBedHeaterTemp.toFixed(2) }}°C</td>
                          <td>Scanning Probe Temp</td>
                          <td>{{ getScanningProbeTemp.toFixed(2) }}°C</td>
                        </tr>
                        <tr></tr>
                      </tbody>
                    </v-simple-table>
                  </v-col>
                </v-row>
                <h2>Progress</h2>
                <v-data-table
                  :headers="calibrationTableHeaders"
                  :items="calibrationProgress.values"
                  hide-default-footer
                  dense
                >
                  <template v-slot:item="{ item }">
                    <tr>
                      <td class="pa-3 text-center">{{ item.index }}</td>
                      <td class="pa-3 text-center">
                        <v-icon>{{ getStateIcon(item.status) }}</v-icon>
                      </td>
                      <td class="pa-3 text-center">{{ item.targetTemp }}°C</td>
                    </tr>
                  </template>
                </v-data-table>

                <div v-if="!calibrationStarted">
                  <v-alert
                    class="centered-alert my-3"
                    type="warning"
                    dense
                    text
                    border="left"
                    v-if="checkStartTemperature()"
                  >
                    The current bed temperature is higher than the start
                    temperature. If you continue, the calibration process will
                    start at the next temperature step above
                    {{ getBedHeaterTemp }}°C.
                  </v-alert>
                  <v-alert
                    type="info"
                    border="left"
                    dense
                    text
                    v-if="!m558_1Executed"
                  >
                    Press the button below to start the calibration process.<br />
                    <code
                      >M558.1 K{{
                        calibrationParams.selectedScanningProbe.id
                      }}
                      S0.5</code
                    >
                    command will be executed when you click it. And the selected
                    tool will be set to the trigger height.
                  </v-alert>
                  <v-btn
                    :disabled="!allAxesHomed"
                    color="blue darken-1"
                    @click="startCalibration"
                    >Start Calibration</v-btn
                  >
                </div>
                <div v-else>
                  <v-alert type="info" border="left" text dense>
                    Calibration in progress. Please wait...
                  </v-alert>
                  <v-btn
                    color="red"
                    v-if="!calibrationCancelled"
                    @click="cancel"
                    >Cancel Calibration</v-btn
                  >
                </div>
              </div>
              <div v-else>
                <h2>Calibration Finished</h2>
                <v-btn color="blue darken-1" @click="downloadCalibrationResults"
                  >Download Calibration Results</v-btn
                >
              </div>
            </v-container>
            <v-divider />
            <v-alert
              :value="calibrationCancelled"
              dense
              border="left"
              text
              type="error"
              class="mt-3"
            >
              Scanning Probe Calibration cancelled!
            </v-alert>
            <v-alert
              :value="calibrationFinished"
              dense
              border="left"
              text
              type="success"
              class="mt-3"
            >
              Scanning Probe Calibration completed!
            </v-alert>
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-card-actions>
        <v-btn
          v-show="!calibrationCancelled && !calibrationFinished"
          color="blue darken-1"
          text
          @click="cancel"
          >Cancel</v-btn
        >
        <v-spacer />
        <v-btn v-show="canGoBack" color="blue darken-1" text @click="goBack"
          >Back</v-btn
        >
        <v-btn
          v-show="currentPage !== 'calibration'"
          color="blue darken-1"
          text
          :disabled="!canGoNext"
          @click="goNext"
          >Next</v-btn
        >
        <v-btn
          :disabled="!calibrationCancelled || !calibrationFinished"
          v-show="currentPage === 'calibration'"
          color="blue darken-1"
          text
          @click="shownInternal = false"
          >Finish</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
"use strict";

import { MachineStatus } from "@duet3d/objectmodel";
import { mapActions, mapState } from "vuex";

const HEATING = "heating";
const SOAK = "soaking";
const COMPLETED = "completed";

export default {
  props: {
    shown: {
      required: true,
      type: Boolean,
    },
  },
  data() {
    return {
      currentPage: "start",
      // Configuration
      showFanConfig: false,
      showChamberHeatersConfig: false,
      calibrationParams: {
        selectedTool: null,
        selectedThermistor: null,
        selectedScanningProbe: null,
        selectedBedHeater: null,
        bedHeaterStart: null,
        bedHeaterStop: null,
        bedHeaterStep: null,
        chamberHeaterStart: null,
        chamberHeaterStop: null,
        fans: [{ id: null, speed: 0 }],
      },
      // Calibration process
      calibrationStarted: false,
      calibrationFinished: false,
      calibrationCancelled: false,
      calibrationResults: {
        calibrationValues: [],
        scanCoefficients: {},
        probeThreshold: null,
        triggerHeight: null,
      },
      calibrationProgress: {
        startTime: 0,
        values: [],
        timeElapsed: 0,
      },
      m558_1Executed: false,
      calibrationTableHeaders: [
        { text: "Index", sortable: false, align: "center", value: "index" },
        { text: "Status", sortable: false, align: "center", value: "status" },
        {
          text: "Target Temp",
          sortable: false,
          align: "center",
          value: "targetTemp",
        },
      ],
    };
  },
  computed: {
    // Internal computed properties
    ...mapState("machine/model", [
      "sensors",
      "move",
      "tools",
      "fans",
      "heat",
      "state",
    ]),
    shownInternal: {
      get() {
        return this.shown;
      },
      set(value) {
        this.$emit("update:shown", value);
      },
    },
    //
    // Getters
    //
    heaters() {
      return this.heat.heaters.map((heater, index) => ({
        ...heater,
        name: `Heater ${index}`,
        id: index,
      }));
    },
    bedHeaterIds() {
      return Object.keys(this.heat.bedHeaters)
        .filter((key) => this.heat.bedHeaters[key] !== -1)
        .map((key) => Number(this.heat.bedHeaters[key]));
    },
    chamberHeaterIds() {
      return Object.keys(this.heat.chamberHeaters)
        .filter((key) => this.heat.chamberHeaters[key] !== -1)
        .map((key) => Number(this.heat.chamberHeaters[key]));
    },
    bedHeaters() {
      return this.heaters.filter((heater) =>
        this.bedHeaterIds.includes(heater.id)
      );
    },
    chamberHeaters() {
      return this.heaters.filter((heater) =>
        this.chamberHeaterIds.includes(heater.id)
      );
    },
    getHeaterMaxTemp() {
      return (heater) => (heater ? heater.max : 0);
    },
    getHeaterMinTemp() {
      return (heater) => (heater ? heater.min : 0);
    },
    getChamberHeaterMaxTemp() {
      return Math.max(...this.chamberHeaters().map((heater) => heater.max));
    },
    getChamberHeaterMinTemp() {
      return Math.min(...this.chamberHeaters().map((heater) => heater.min));
    },
    scanningProbes() {
      const annotatedSensors = this.sensors.probes.map((sensor, index) => ({
        ...sensor,
        id: index,
      }));
      return annotatedSensors.filter((sensor) => sensor.type == 11);
    },
    thermistors() {
      return this.sensors.analog.map((sensor, index) => ({
        text: sensor.name || index.toString(),
        thermistor: sensor,
      }));
    },
    toolList() {
      return this.tools.map((tool, index) => ({
        text: tool.name || index.toString(),
        tool: { ...tool, id: index },
      }));
    },
    //
    // Calibration Params Getters
    //
    selectedTool() {
      return this.calibrationParams.selectedTool;
    },
    selectedScanningProbe() {
      return this.calibrationParams.selectedScanningProbe;
    },
    selectedBedHeater() {
      return this.calibrationParams.selectedBedHeater;
    },
    selectedThermistor() {
      return this.calibrationParams.selectedThermistor;
    },
    getBedHeaterActiveTemp() {
      return this.selectedBedHeater.active;
    },
    getBedHeaterTemp() {
      return this.selectedBedHeater ? this.selectedBedHeater.current : 0;
    },
    getScanningProbeTemp() {
      return this.selectedThermistor ? this.selectedThermistor.lastReading : 0;
    },
    getScanningProbeValue() {
      return this.selectedScanningProbe
        ? this.selectedScanningProbe.value[0]
        : 0;
    },
    //
    // Booleans
    //
    isBusy() {
      return this.state.status === MachineStatus.busy;
    },
    hasMultipleScanningProbes() {
      return this.scanningProbes.length > 1;
    },
    allAxesHomed() {
      return !this.move.axes.some((axis) => axis.visible && !axis.homed);
    },
    //
    // Page navigation
    //
    canGoBack() {
      if (this.currentPage === "config") {
        return true;
      }
      if (this.currentPage === "calibration") {
        return !this.calibrationStarted;
      }
    },
    canGoNext() {
      switch (this.currentPage) {
        case "start":
          return this.scanningProbes.length > 0 && this.allAxesHomed;
        case "config":
          return this.isConfigPageValid;
      }
      return false;
    },
    isConfigPageValid() {
      const isScanningProbeSelected = this.selectedScanningProbe !== null;
      const isToolSelected = this.selectedTool !== null;
      const isThermistorSelected = this.selectedThermistor !== null;
      const bedHeater = this.selectedBedHeater;
      const bedHeaterValid =
        bedHeater != null &&
        this.calibrationParams.bedHeaterStart <=
          this.calibrationParams.bedHeaterStop &&
        this.calibrationParams.bedHeaterStart >= bedHeater.min &&
        this.calibrationParams.bedHeaterStop <= bedHeater.max &&
        this.calibrationParams.bedHeaterStep > 0;
      const chamberHeatersValid =
        !this.showChamberHeatersConfig ||
        (this.calibrationParams.chamberHeaterStart !== null &&
          this.calibrationParams.chamberHeaterStop !== null);
      let fansValid = true;
      if (this.showFanConfig) {
        fansValid = this.calibrationParams.fans.every(
          (fan) => fan.id !== null && fan.speed >= 0 && fan.speed <= 255
        );
      }

      return (
        isScanningProbeSelected &&
        isToolSelected &&
        isThermistorSelected &&
        bedHeaterValid &&
        chamberHeatersValid &&
        fansValid
      );
    },
    //
    // Rules
    //
    toolIsRequired() {
      return [(v) => v !== null || "Tool selection is required"];
    },
    scanningProbeIsRequired() {
      return [(v) => v !== null || "Probe index is required"];
    },
    thermistorIsRequired() {
      return [(v) => v !== null || "A thermistor must be selected."];
    },
    startTempRules() {
      return (maxTemp) => [
        (v) => (v !== null && v !== "") || "Start temperature is required",
        (v) => Number(v) >= 0 || "Start temperature must be >= 0",
        (v) =>
          Number(v) <= maxTemp || `Start temperature must be <= ${maxTemp}`,
      ];
    },
    stopTempRules() {
      return (start, maxTemp) => [
        (v) => (v !== null && v !== "") || "Stop temperature is required",
        (v) =>
          Number(v) >= start || "Stop temperature must be >= start temperature",
        (v) => Number(v) <= maxTemp || `Stop temperature must be <= ${maxTemp}`,
      ];
    },
    stepTempRules() {
      return [
        (v) => (v !== null && v !== "") || "Step temperature is required",
        (v) => Number(v) > 0 || "Step temperature must be > 0",
      ];
    },
  },
  methods: {
    ...mapActions("machine", ["sendCode"]),
    //
    // Initialization methods
    //
    initialiseCalibrationParams() {
      if (this.scanningProbes.length === 1) {
        this.calibrationParams.selectedScanningProbe = this.scanningProbes[0];
      }
      if (this.thermistors.length === 1) {
        this.calibrationParams.selectedThermistor =
          this.thermistors[0].thermistor;
      }
      if (this.toolList.length === 1) {
        this.calibrationParams.selectedTool = this.toolList[0].tool;
      }
      if (this.bedHeaters.length === 1) {
        this.calibrationParams.selectedBedHeater = this.bedHeaters[0];
      }
      this.initialiseCalibrationProgress();
    },
    //
    // Configuration methods
    //
    addFan() {
      this.calibrationParams.fans.push({ id: null, speed: 0 });
    },
    removeFan(index) {
      this.calibrationParams.fans.splice(index, 1);
    },
    //
    // Getters
    //
    getAvailableItems(allItems, selectedIds) {
      return allItems
        .map((item, index) => ({
          item,
          id: index,
        }))
        .filter((item) => item.item !== null && !selectedIds.includes(item.id));
    },
    availableFans() {
      const selectedFanIds = this.calibrationParams.fans.map((fan) => fan.id);
      return this.getAvailableItems(this.fans, selectedFanIds);
    },
    availableFansFor(fan) {
      const fanId = fan.id;
      const selectedFanIds = this.availableFans().filter((id) => id != fanId);
      return this.getAvailableItems(this.fans, selectedFanIds);
    },
    getBedHeaterLabel(start, stop) {
      let minTemp = 0;
      let maxTemp = 0;
      const bedHeater = this.selectedBedHeater;

      if (bedHeater !== null) {
        minTemp = Math.max(0, bedHeater.min);
        maxTemp = bedHeater.max;
      }
      if (start !== null) {
        minTemp = Math.min(Math.max(minTemp, start), maxTemp);
      }
      if (stop !== null) {
        maxTemp = Math.max(Math.min(maxTemp, stop), minTemp);
      }

      return `[${minTemp}-${maxTemp}]`;
    },
    getBedHeaterStartLabel() {
      const bedHeaterStop = this.calibrationParams.bedHeaterStop;
      return this.getBedHeaterLabel(null, bedHeaterStop);
    },
    getBedHeaterStopLabel() {
      const bedHeaterStart = this.calibrationParams.bedHeaterStart;
      return this.getBedHeaterLabel(bedHeaterStart, null);
    },
    getStateIcon(status) {
      if (status === null) {
        return;
      }
      if (status == "heating") {
        return "mdi-radiator";
      }
      if (status == "soaking") {
        return "mdi-clock";
        return "mdi-radiator-disabled";
      }
      return "mdi-check";
    },
    //
    // Machine Operations
    //
    async homeMachine() {
      await this.sendCode("G28");
    },
    async setBedHeater(temp) {
      await this.sendCode(`M140 S${temp}`);
    },
    async disableBedHeater() {
      await this.setBedHeater(-273.1);
    },
    async setChamberHeater(temp) {
      await this.sendCode(`M141 S${temp}`);
    },
    async disableChamberHeater() {
      await this.setChamberHeater(-273.1);
    },
    async enableChamberHeater(bedTemp) {
      if (
        this.showChamberHeatersConfig === false ||
        !this.showChamberHeatersConfig
      ) {
        return;
      }
      const heaterStart = this.calibrationParams.chamberHeaterStart;
      const heaterStop = this.calibrationParams.chamberHeaterStop;
      const targetChamberTemp = Number.min(
        heaterStop,
        Number.max(heaterStart, bedTemp)
      );
      await this.setChamberHeater(targetChamberTemp);
    },
    async setFan(fanId, speed) {
      await this.sendCode(`M106 P${fanId} S${speed}`);
    },
    async disableFan(fanId) {
      await this.setFan(fanId, 0);
    },
    async enableFans() {
      const enableFan =
        this.showFanConfig && this.calibrationParams.fans.length > 0;
      if (!enableFan) {
        return;
      }
      const fans = this.calibrationParams.fans;
      for (const fan of fans) {
        await this.setFan(fan.id, fan.speed);
      }
    },
    async disableFans() {
      if (!this.showFanConfig) {
        return;
      }
      const fans = this.calibrationParams.fans;
      for (const fan of fans) {
        await this.disableFan(fan.id);
      }
    },
    //
    // Pre Calibration
    //
    loadCalibrationPage() {
      this.resetCalibrationResults();
      this.calibrationStarted = false;
      this.calibrationFinished = false;
      this.calibrationCancelled = false;
      this.m558_1Executed = false;
      this.initialiseCalibrationProgress();
    },
    calculateTemps() {
      const start = this.calibrationParams.bedHeaterStart;
      const stop = this.calibrationParams.bedHeaterStop;
      const step = this.calibrationParams.bedHeaterStep;
      const n = Math.ceil((Number(stop) - Number(start)) / Number(step));
      const temps = Array.from({ length: n }, (_, i) =>
        Math.min(Number(start) + i * Number(step), Number(stop))
      );
      if (Number(stop) !== temps[temps.length - 1]) {
        temps.push(Number(stop));
      }
      return temps;
    },
    resetCalibrationResults() {
      this.calibrationResults = {
        calibrationValues: [],
        scanCoefficients: {},
        probeThreshold: null,
        triggerHeight: null,
      };
    },
    initialiseCalibrationProgress() {
      const temps = this.calculateTemps();
      this.calibrationProgress.values = temps.map((targetTemp, index) => ({
        status: null,
        index: index + 1,
        targetTemp,
      }));
    },
    //
    // Calibration Process
    //
    async startCalibration() {
      this.calibrationStarted = true;
      await this.doM558_1();
      await this.setToolToTriggerHeight();
      this.recordProbeSettings();
      await this.startMeasurement();
    },
    async awaitBusy(milliseconds = 1000) {
      while (this.isBusy) {
        await this.delay(milliseconds);
      }
    },
    async doM558_1() {
      const probeId = this.selectedScanningProbe.id;
      const m558_1_S_Value = 0.5;
      const m558_1Command = `M558.1 K${probeId} S${m558_1_S_Value}`;
      await this.sendCode(m558_1Command);
      await this.awaitBusy();
      this.m558_1Executed = true;
    },
    async doG1(toolId, zValue) {
      const g1Command = `G1 P${toolId} Z${zValue}`;
      await this.sendCode(g1Command);
      await this.awaitBusy();
    },
    recordProbeSettings() {
      const scanningProbe = this.selectedScanningProbe;
      this.recordProbeValue(scanningProbe);
      this.recordTriggerHeight(scanningProbe);
      this.recordScanCoefficients(scanningProbe);
      this.recordProbeThreshold(scanningProbe);
    },
    recordProbeThreshold(scanningProbe) {
      this.calibrationResults.probeThreshold = scanningProbe.threshold;
    },
    recordTriggerHeight(scanningProbe) {
      this.calibrationResults.triggerHeight = scanningProbe.triggerHeight;
    },
    recordScanCoefficients(scanningProbe) {
      const scanCoefficients = {
        probeValueDelta: scanningProbe.scanCoefficients[0],
        A: scanningProbe.scanCoefficients[1],
        B: scanningProbe.scanCoefficients[2],
        C: scanningProbe.scanCoefficients[3],
      };
      this.calibrationResults.scanCoefficients = scanCoefficients;
    },
    async setToolToTriggerHeight() {
      const toolId = this.selectedTool.id;
      const probeTriggerHeight = this.selectedScanningProbe.triggerHeight;
      await this.doG1(toolId, probeTriggerHeight);
      await this.awaitBusy();
    },
    async startMeasurement() {
      const temps = this.calibrationProgress.values.map(
        (item) => item.targetTemp
      );
      await this.enableFans();
      this.calibrationProgress.startTime = Date.now();

      for (let i = 0; i < temps.length; i++) {
        const temp = temps[i];
        if (this.getBedHeaterTemp > temp + 1) {
          this.setCalibrationStatus(i, COMPLETED);
          continue;
        }
        this.setCalibrationStatus(i, HEATING);
        await this.waitForStabilization(temp);

        this.setCalibrationStatus(i, SOAK);
        await this.soakAtTemp();

        this.setCalibrationStatus(i, COMPLETED);

        if (this.calibrationCancelled) {
          this.cleanUp();
          return;
        }
      }
      await this.finishMeasurement();
    },
    setCalibrationStatus(index, status) {
      this.calibrationProgress.values[index].status = status;
    },
    async updateProgressLoop() {
      this.updateTimeElapsed();
      await this.recordProbeValue();
      await this.delay(1000);
    },
    updateTimeElapsed() {
      const timeElapsed = Date.now() - this.calibrationProgress.startTime;
      this.calibrationProgress.timeElapsed = timeElapsed;
    },
    checkStartTemperature() {
      const currentTemp = this.getBedHeaterTemp;
      const startTemp = Number(this.calibrationParams.bedHeaterStart) + 1;
      return currentTemp > startTemp;
    },
    isTemperatureStable(targetTemp) {
      const currentTemp = this.getBedHeaterTemp;
      return Math.abs(currentTemp - targetTemp) < 1;
    },
    async waitForStabilization(targetTemp) {
      await this.setBedHeater(targetTemp);
      while (!this.isTemperatureStable(targetTemp)) {
        if (this.calibrationCancelled) {
          this.cleanUp();
          break;
        }
        await this.updateProgressLoop();
      }
    },
    async soakAtTemp(duration = 300000) {
      // Default soak duration is 5 minutes
      const soakStartTime = Date.now();
      await this.delay(1000);
      while (duration > Date.now() - soakStartTime) {
        if (this.calibrationCancelled) {
          this.cleanUp();
          break;
        }
        await this.updateProgressLoop();
      }
    },
    async cleanUp() {
      await this.disableBedHeater();
      await this.disableChamberHeater();
      await this.disableFans();
    },
    async finishMeasurement() {
      await this.cleanUp();
      this.calibrationFinished = true;
    },
    downloadCalibrationResults() {
      const filename = this.getSavedFilename() + ".json";
      this.downloadJSON(this.calibrationResults, filename);
    },
    getSavedFilename() {
      const time = new Date().toISOString().replace(/:/g, "-");
      const probeId = this.selectedScanningProbe.id;
      return `scanning-probe-index-${probeId}-calibration-${time}`;
    },
    async recordProbeValue() {
      const currentTargetBedTemp = this.getBedHeaterActiveTemp;

      await this.disableBedHeater();

      const currentBedTemp = this.getBedHeaterTemp;
      const currentProbeValue = this.getScanningProbeValue;
      const currentProbeTemp = this.getScanningProbeTemp;
      await this.setBedHeater(currentTargetBedTemp);
      const res = [currentBedTemp, currentProbeTemp, currentProbeValue];
      this.calibrationResults.calibrationValues.push(res);
    },
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    formatTime(ms) {
      if (!ms) {
        return "0m 0s";
      }
      const minutes = Math.floor(ms / (1000 * 60));
      const seconds = Math.floor((ms % (1000 * 60)) / 1000);
      return `${minutes}m ${seconds}s`;
    },
    //
    // Page operations
    //
    cancel() {
      if (this.currentPage === "calibration" && !this.calibrationCancelled) {
        this.calibrationCancelled = true;
      } else {
        this.shownInternal = false;
      }
    },
    goBack() {
      switch (this.currentPage) {
        case "config":
          this.currentPage = "start";
          break;
        case "calibration":
          this.currentPage = "config";
          break;
      }
    },
    goNext() {
      switch (this.currentPage) {
        case "start":
          this.currentPage = "config";
          break;
        case "config":
          this.currentPage = "calibration";
          this.loadCalibrationPage();
          break;
      }
    },
    //
    // File operations
    //
    downloadJSON(calibrationResults, filename) {
      const jsonString = JSON.stringify(calibrationResults, null, 2);
      const blob = new Blob([jsonString], {
        type: "application/json;charset=utf-8;",
      });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(link.href);
    },
  },
  created() {
    this.initialiseCalibrationParams();
  },
  mounted() {},
  watch: {
    shown(to) {
      if (to) {
        this.initialiseCalibrationParams();
      } else {
        if (this.currentPage === "calibration") {
          this.calibrationCancelled = true;
        }
        this.currentPage = "start";
        this.calibrationCancelled = this.calibrationFinished = false;
      }
    },
    "state.status"(to) {
      if (
        (to === MachineStatus.disconnected || to === MachineStatus.off) &&
        this.currentPage === "calibration"
      ) {
        this.calibrationCancelled = true;
      }
    },
    scanningProbes(newProbes) {
      if (newProbes.length === 1) {
        this.calibrationParams.selectedScanningProbe = newProbes[0];
      }
    },
    tools(newTools) {
      if (newTools.length === 1) {
        this.calibrationParams.selectedTool = newTools[0];
      }
    },
    bedHeaters(newHeaters) {
      if (newHeaters.length === 1) {
        this.calibrationParams.selectedBedHeater = newHeaters[0];
      }
    },
  },
};
</script>
