<style>
.centered-alert {
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
                      class="mb-1"
                      hide-details
                      :rules="scanningProbeIsRequired()"
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
                      :rules="thermistorIsRequired()"
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
                      class="mb-1"
                      hide-details
                      :rules="toolIsRequired()"
                    ></v-select>
                  </v-col>
                </v-row>
              </div>
              <div>
                <v-col class="px-0">
                  <v-simple-table>
                    <thead>
                      <tr>
                        <th class="pl-0">Heater</th>
                        <th style="width: 20%">Start (°C)</th>
                        <th style="width: 20%">Stop (°C)</th>
                        <th style="width: 20%" class="pr-0">Step (°C)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr index="bedHeater" class="mt-3 mb-3">
                        <td class="pl-0">
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
                            class="mb-3"
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
                            class="mb-3"
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
                            class="mb-3"
                            hide-details
                            :rules="
                              stopTempRules(
                                Number(calibrationParams.bedHeaterStart),
                                getHeaterMaxTemp(selectedBedHeater)
                              )
                            "
                          ></v-text-field>
                        </td>
                        <td style="width: 20%">
                          <v-text-field
                            v-model="calibrationParams.bedHeaterStep"
                            type="number"
                            class="mb-3"
                            hide-details
                            :rules="stepTempRules"
                          ></v-text-field>
                        </td>
                      </tr>
                    </tbody>
                  </v-simple-table>
                </v-col>
              </div>
              <div class="mt-0 mb-0">
                <v-alert type="info" border="left" text dense class="">
                  You should enclose your printer if possible to help simulate
                  higher probe temperatures.
                </v-alert>
              </div>
              <v-divider/>
              <v-checkbox
                v-model="showChamberHeatersConfig"
                label="Add Chamber Heater to the calibration process"
                :disabled="
                  !showChamberHeatersConfig && chamberHeaters.length === 0
                "
              />
              <div v-if="showChamberHeatersConfig" class="mb-3">
                <v-row class="px-0">
                  <v-col>
                    <v-text-field
                      v-model="calibrationParams.chamberHeaterStart"
                      type="number"
                      label="Start Temperature (°C)"
                      hide-details
                      class="pt-0"
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
                      class="pt-0"
                      :min="calibrationParams.chamberHeaterStart"
                      :max="getChamberHeaterMaxTemp()"
                      :rules="
                        stopTempRules(
                          Number(calibrationParams.chamberHeaterStart),
                          getChamberHeaterMaxTemp()
                        )
                      "
                    />
                  </v-col>
                </v-row>
              </div>
              <v-divider class="mt-3" />
              <v-checkbox
                v-model="showFanConfig"
                label="Add a Fan to the calibration process"
                :disabled="!showFanConfig && fans.length === 0"
                class="mt-3"
              ></v-checkbox>
              <div v-if="showFanConfig"">
                <v-simple-table class="mb-3">
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
                      <td class="px-0">
                        <v-select
                          v-model="fan.id"
                          :items="availableFansFor(fan)"
                          item-text="text"
                          item-value="id"
                          label="Select Fan"
                          hide-details
                          class="mb-3"
                        />
                      </td>
                      <td>
                        <v-text-field
                          v-model.number="fan.speed"
                          type="number"
                          :min="0"
                          :max="255"
                          label="[0-255]"
                          hide-details
                          class="mb-3"
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
                  class="px-3 mb-3"
                  outlined
                  text
                  @click="addFan"
                >
                  <v-icon class="mr-1">mdi-plus</v-icon>
                  Add Fan
                </v-btn>
              </div>
              <v-divider class="mt-3" />
              <v-alert v-if="isConfigPageValid" type="info" dense border="left" text class="mt-3 mb-3">
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
                    <v-simple-table class="table-padding calibration-table">
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
                    v-if="!m558_1Executed && calibrationParams.selectedScanningProbe"
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

<script lang="ts">
import ObjectModel, { MachineStatus } from "@duet3d/objectmodel";
import { Heater } from "@duet3d/objectmodel/dist/heat/Heater";
import { Probe, ProbeType } from "@duet3d/objectmodel/dist/sensors/Probe";
import { Fan } from "@duet3d/objectmodel/dist/fans";
import { Tool } from "@duet3d/objectmodel/dist/tools";
import { AnalogSensor } from "@duet3d/objectmodel/dist/sensors/AnalogSensor";
import { Axis } from "@duet3d/objectmodel/dist/move/Axis";
import { mapActions } from "vuex";
import Vue from "vue";

import store from "@/store";

interface ExtendedHeater extends Heater {
  id: number;
  name: string;
}

interface ExtendedProbe extends Probe {
  id: number;
}

interface ExtendedTool extends Tool {
  id: number;
  text: string;
}

interface ExtendedFan extends Fan {
  id: number;
  text: string;
}

interface SelectedFan {
  id: number | null;
  speed: number;
}

interface ExtendedAnalogSensor extends AnalogSensor {
  text: string;
}

interface CalibrationParams {
  selectedTool: ExtendedTool | null;
  selectedThermistor: ExtendedAnalogSensor | null;
  selectedScanningProbe: ExtendedProbe | null;
  selectedBedHeater: ExtendedHeater | null;
  bedHeaterStart: number | null;
  bedHeaterStop: number | null;
  bedHeaterStep: number | null;
  chamberHeaterStart: number | null;
  chamberHeaterStop: number | null;
  fans: SelectedFan[];
}

interface ScanCoefficients {
  probeValueDelta: number | null;
  A: number | null;
  B: number | null;
  C: number | null;
}

interface CalibrationResults {
  calibrationValues: Array<any>;
  scanCoefficients: ScanCoefficients;
  probeThreshold: number | null;
  triggerHeight: number | null;
}

interface CalibrationProgress {
  startTime: number;
  values: Array<any>;
  timeElapsed: number;
}

function assignIndexAndRemoveNull<T>(arr: (T | null)[]): {id: number, val: T}[] {
  return arr.map((val, id) => ({ id, val })).filter((val) => val.val !== null) as {id: number, val: T}[];
}

enum CalibrationStatus {
  heating = "heating",
  soaking = "soaking",
  completed = "completed",
}
export default Vue.extend({
  props: {
    shown: {
      required: true,
      type: Boolean,
    },
  },
  data() {
    return {
      currentPage: "start" as string,
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
      } as CalibrationParams,
      calibrationStarted: false,
      calibrationFinished: false,
      calibrationCancelled: false,
      calibrationResults: {
        calibrationValues: [],
        scanCoefficients: {
          probeValueDelta: null,
          A: null,
          B: null,
          C: null,
        } as ScanCoefficients,
        probeThreshold: null,
        triggerHeight: null,
      } as CalibrationResults,
      calibrationProgress: {
        startTime: 0,
        values: [],
        timeElapsed: 0,
      } as CalibrationProgress,
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
    shownInternal: {
      get(): boolean {
        return this.shown;
      },
      set(to: boolean) {
        if (!to) {
          this.$emit("update:shown", false);
        }
      },
    },
    model(): ObjectModel {
      return store.state.machine.model;
    },
    heaters(): ExtendedHeater[] {
      const indexedHeaters: {id: number, val: Heater}[] = assignIndexAndRemoveNull(this.model.heat.heaters);
      return indexedHeaters.map(({ id, val }) => ({ ...val, id, name: `Heater ${id}` } as ExtendedHeater));
    },
    bedHeaters(): ExtendedHeater[] {
      const bedHeaterIds: number[] = this.model.heat.bedHeaters
        .filter((value: number) => value !== -1)
        .map((value: number) => value);
      return this.heaters.filter((heater) => bedHeaterIds.includes(heater.id));
    },
    chamberHeaters(): ExtendedHeater[] {
      const chamberHeaterIds: number[] = this.model.heat.chamberHeaters
        .filter((value: number) => value !== -1)
        .map((value: number) => value);
      return this.heaters.filter((heater) =>
        chamberHeaterIds.includes(heater.id)
      );
    },
    scanningProbes(): ExtendedProbe[] {
      const indexedProbes: {id: number, val: Probe}[] = assignIndexAndRemoveNull(this.model.sensors.probes);
      return indexedProbes.map(({ id, val }) => ({ ...val, id } as ExtendedProbe)).filter((probe: ExtendedProbe) => probe.type === ProbeType.scanningAnalog);
    },
    thermistors(): ExtendedAnalogSensor[] {
      const indexedThermistors: {id: number, val: AnalogSensor}[] = assignIndexAndRemoveNull(this.model.sensors.analog);
      return indexedThermistors.map(({ id, val }) => ({ ...val, text: val.name || id.toString() } as ExtendedAnalogSensor));
    },
    fans(): ExtendedFan[] {
      const indexedFans: {id: number, val: Fan}[] = assignIndexAndRemoveNull(this.model.fans);
      return indexedFans.map(({ id, val }) => ({ ...val, id, text: val.name || `Fan ${id}` } as ExtendedFan));
    },
    toolList(): ExtendedTool[] {
      const indexedTools: {id: number, val: Tool}[] = assignIndexAndRemoveNull(this.model.tools);
      return indexedTools.map(({ id, val }) => ({ ...val, id, text: val.name || id.toString() } as ExtendedTool));
    },
    hasMultipleScanningProbes(): boolean {
      return this.scanningProbes.length > 1;
    },
    selectedTool(): ExtendedTool | null {
      return this.calibrationParams.selectedTool;
    },
    selectedScanningProbe(): ExtendedProbe | null {
      return this.calibrationParams.selectedScanningProbe;
    },
    selectedBedHeater(): ExtendedHeater | null {
      return this.calibrationParams.selectedBedHeater;
    },
    selectedThermistor(): ExtendedAnalogSensor | null {
      return this.calibrationParams.selectedThermistor;
    },
    getBedHeaterActiveTemp(): number {
      return this.selectedBedHeater ? this.selectedBedHeater.active : 0;
    },
    getBedHeaterTemp(): number {
      return this.selectedBedHeater ? this.selectedBedHeater.current : 0;
    },
    getScanningProbeTemp(): number {
      return this.selectedThermistor?.lastReading || 0;
    },
    getScanningProbeValue(): number {
      return this.selectedScanningProbe?.value[0] || 0;
    },
    isBusy(): boolean {
      return this.model.state.status === MachineStatus.busy;
    },
    allAxesHomed(): boolean {
      return this.model.move.axes.every(
        (axis: Axis) => !axis.visible || axis.homed
      );
    },
    canGoBack(): boolean {
      if (this.currentPage === "config") {
        return true;
      }
      if (this.currentPage === "calibration") {
        return !this.calibrationStarted;
      }
      return false;
    },
    canGoNext(): boolean {
      switch (this.currentPage) {
        case "start":
          return this.scanningProbes.length > 0 && this.allAxesHomed;
        case "config":
          return this.isConfigPageValid;
      }
      return false;
    },
    isConfigPageValid(): boolean {
      const isScanningProbeSelected = this.selectedScanningProbe !== null;
      const isToolSelected = this.selectedTool !== null;
      const isThermistorSelected = this.selectedThermistor !== null;
      const bedHeater = this.selectedBedHeater;
      const bedHeaterValid =
        bedHeater != null &&
        this.calibrationParams.bedHeaterStart !== null &&
        this.calibrationParams.bedHeaterStop !== null &&
        this.calibrationParams.bedHeaterStep !== null &&
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
  },
  methods: {
    getHeaterMaxTemp(heater: ExtendedHeater | null): number {
      return heater ? heater.max : 0;
    },
    getHeaterMinTemp(heater: ExtendedHeater | null): number {
      return heater ? heater.min : 0;
    },
    getChamberHeaterMaxTemp(): number {
      return Math.max(...this.chamberHeaters.map((heater) => heater.max));
    },
    getChamberHeaterMinTemp(): number {
      return Math.min(...this.chamberHeaters.map((heater) => heater.min));
    },
    toolIsRequired(): ((v: any) => boolean | string)[] {
      return [(v) => v !== null || "Tool selection is required"];
    },
    scanningProbeIsRequired(): ((v: any) => boolean | string)[] {
      return [(v) => v !== null || "Probe index is required"];
    },
    thermistorIsRequired(): ((v: any) => boolean | string)[] {
      return [(v) => v !== null || "A thermistor must be selected."];
    },
    startTempRules(maxTemp: number): ((v: any) => boolean | string)[] {
      return [
        (v) => (v !== null && v !== "") || "Start temperature is required",
        (v) => Number(v) >= 0 || "Start temperature must be >= 0",
        (v) =>
          Number(v) <= maxTemp || `Start temperature must be <= ${maxTemp}`,
      ];
    },
    stopTempRules(
      start: number,
      maxTemp: number
    ): ((v: any) => boolean | string)[] {
      return [
        (v) => (v !== null && v !== "") || "Stop temperature is required",
        (v) =>
          Number(v) >= start || "Stop temperature must be >= start temperature",
        (v) => Number(v) <= maxTemp || `Stop temperature must be <= ${maxTemp}`,
      ];
    },
    stepTempRules(): ((v: any) => boolean | string)[] {
      return [
        (v) => (v !== null && v !== "") || "Step temperature is required",
        (v) => Number(v) > 0 || "Step temperature must be > 0",
      ];
    },
    //
    // Initialization methods
    //
    initialiseCalibrationParams() {
      if (this.scanningProbes.length === 1) {
        this.calibrationParams.selectedScanningProbe = this.scanningProbes[0];
      }
      if (this.thermistors.length === 1) {
        this.calibrationParams.selectedThermistor =
          this.thermistors[0];
      }
      if (this.toolList.length === 1) {
        this.calibrationParams.selectedTool = this.toolList[0];
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
    removeFan(index: number) {
      this.calibrationParams.fans.splice(index, 1);
    },
    //
    // Getters
    //
    getAvailableFans(selectedIds: number[]): ExtendedFan[] {
      return this.fans.filter((fan: ExtendedFan) => !selectedIds.includes(fan.id));
    },
    availableFansFor(fan: SelectedFan): ExtendedFan[] {
      const fanId: number = fan.id ? fan.id : -1;
      const selectedFanIds: number[] = this.calibrationParams.fans
      .map((fan: SelectedFan) => fan.id)
      .filter((id: number | null) => id !== null && id !== fanId) as number[];

      return this.getAvailableFans(selectedFanIds);
    },
    getBedHeaterLabel(start: number | null, stop: number | null): string {
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
    getBedHeaterStartLabel(): string {
      const bedHeaterStop = this.calibrationParams.bedHeaterStop;
      return this.getBedHeaterLabel(null, bedHeaterStop);
    },
    getBedHeaterStopLabel(): string {
      const bedHeaterStart = this.calibrationParams.bedHeaterStart;
      return this.getBedHeaterLabel(bedHeaterStart, null);
    },
    getStateIcon(status: CalibrationStatus | null): string {
      if (status === null) {
        return "";
      }
      if (status == CalibrationStatus.heating) {
        return "mdi-radiator";
      }
      if (status == CalibrationStatus.soaking) {
        return "mdi-clock";
      }
      return "mdi-check";
    },
    //
    // Machine Operations
    //
    ...mapActions("machine", ["sendCode"]),
    async homeMachine() {
      await this.sendCode("G28");
    },
    async setBedHeater(temp: number) {
      await this.sendCode(`M140 S${temp}`);
    },
    async disableBedHeater() {
      await this.setBedHeater(-273.1);
    },
    async setChamberHeater(temp: number) {
      await this.sendCode(`M141 S${temp}`);
    },
    async disableChamberHeater() {
      await this.setChamberHeater(-273.1);
    },
    async enableChamberHeater(bedTemp: number) {
      if (
        !this.showChamberHeatersConfig
      ) {
        return;
      }
      const heaterStart = this.calibrationParams.chamberHeaterStart;
      const heaterStop = this.calibrationParams.chamberHeaterStop;
      const targetChamberTemp = Math.min(
        heaterStop ?? 0,
        Math.max(heaterStart ?? 0, bedTemp)
      );
      await this.setChamberHeater(targetChamberTemp);
    },
    async setFan(fanId: number | null, speed: number) {
      if (fanId === null) {
        return;
      }
      await this.sendCode(`M106 P${fanId} S${speed}`);
    },
    async disableFan(fan: number | null) {
      await this.setFan(fan, 0);
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
        scanCoefficients: {
          probeValueDelta: null,
          A: null,
          B: null,
          C: null,
        } as ScanCoefficients,
        probeThreshold: null,
        triggerHeight: null,
      };
    },
    initialiseCalibrationProgress() {
      const temps = this.calculateTemps();
      this.calibrationProgress.values = temps.map((targetTemp: number, index: number) => ({
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
      const probeId: number = this.selectedScanningProbe!.id;
      const m558_1_S_Value: number = 0.5;
      const m558_1Command: string = `M558.1 K${probeId} S${m558_1_S_Value}`;
      await this.sendCode(m558_1Command);
      await this.awaitBusy();
      this.m558_1Executed = true;
    },
    async doG1(toolId: number, zValue: number) {
      const g1Command: string = `G1 P${toolId} Z${zValue}`;
      await this.sendCode(g1Command);
      await this.awaitBusy();
    },
    recordProbeSettings() {
      const scanningProbe: ExtendedProbe = this.selectedScanningProbe!;
      this.recordProbeValue();
      this.recordTriggerHeight(scanningProbe);
      this.recordScanCoefficients(scanningProbe);
      this.recordProbeThreshold(scanningProbe);
    },
    recordProbeThreshold(scanningProbe: ExtendedProbe) {
      this.calibrationResults.probeThreshold = scanningProbe.threshold;
    },
    recordTriggerHeight(scanningProbe: ExtendedProbe) {
      this.calibrationResults.triggerHeight = scanningProbe.triggerHeight;
    },
    recordScanCoefficients(scanningProbe: ExtendedProbe) {
      if (scanningProbe.scanCoefficients ) {
        this.calibrationResults.scanCoefficients = {
          probeValueDelta: scanningProbe.scanCoefficients![0],
          A: scanningProbe.scanCoefficients[1],
          B: scanningProbe.scanCoefficients[2],
          C: scanningProbe.scanCoefficients[3],
        };
      }
    },
    async setToolToTriggerHeight() {
      const toolId = this.selectedTool!.id;
      const probeTriggerHeight = this.selectedScanningProbe!.triggerHeight;
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
          this.setCalibrationStatus(i, CalibrationStatus.completed);
          continue;
        }
        this.setCalibrationStatus(i, CalibrationStatus.heating);
        await this.waitForStabilization(temp);

        this.setCalibrationStatus(i, CalibrationStatus.soaking);
        await this.soakAtTemp();

        this.setCalibrationStatus(i, CalibrationStatus.completed);

        if (this.calibrationCancelled) {
          this.cleanUp();
          return;
        }
      }
      await this.finishMeasurement();
    },
    setCalibrationStatus(index: number, status: CalibrationStatus) {
      this.calibrationProgress.values[index].status = status;
    },
    async updateProgressLoop() {
      this.updateTimeElapsed();
      await this.recordProbeValue();
      await this.delay(1000);
    },
    updateTimeElapsed() {
      const timeElapsed: number = Date.now() - this.calibrationProgress.startTime;
      this.calibrationProgress.timeElapsed = timeElapsed;
    },
    checkStartTemperature(): boolean {
      const currentTemp: number = this.getBedHeaterTemp;
      const startTemp: number = Number(this.calibrationParams.bedHeaterStart) + 1;
      return currentTemp > startTemp;
    },
    isTemperatureStable(targetTemp: number) {
      const currentTemp = this.getBedHeaterTemp;
      return Math.abs(currentTemp - targetTemp) < 1;
    },
    async waitForStabilization(targetTemp: number) {
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
      const soakStartTime: number = Date.now();
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
      const filename: string = this.getSavedFilename() + ".json";
      this.downloadJSON(this.calibrationResults, filename);
    },
    getSavedFilename(): string {
      const time: string = new Date().toISOString().replace(/:/g, "-");
      const probeId: number = this.selectedScanningProbe!.id;
      return `scanning-probe-index-${probeId}-calibration-${time}`;
    },
    async recordProbeValue() {
      const currentTargetBedTemp: number = this.getBedHeaterActiveTemp;

      await this.disableBedHeater();

      const currentBedTemp: number = this.getBedHeaterTemp;
      const currentProbeValue: number = this.getScanningProbeValue;
      const currentProbeTemp: number = this.getScanningProbeTemp;
      await this.setBedHeater(currentTargetBedTemp);
      const res: number[] = [currentBedTemp, currentProbeTemp, currentProbeValue];
      this.calibrationResults.calibrationValues.push(res);
    },
    delay(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    formatTime(ms: number) {
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
    downloadJSON(calibrationResults: CalibrationResults, filename: string) {
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
    "model.state.status"(to) {
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
    toolList(newTools) {
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
});
</script>
