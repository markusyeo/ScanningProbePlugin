<style scoped>
.content {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow-y: hidden;
  width: 100% !important;
  height: 100%;
}

.flex-grow-1 {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

<template>
  <v-row class="parent-container">
    <v-col>
      <v-card>
        <!-- Tabs -->
        <v-tabs v-model="tab">
          <v-tab href="#probechart">
            <v-icon class="mr-1">mdi-chart-multiple</v-icon>
            Probe Chart
          </v-tab>
          <v-tab href="#calibration">
            <v-icon class="mr-1">mdi-chart-scatter-plot</v-icon>
            Calibration
          </v-tab>
          <v-btn
            color="success"
            class="align-self-center ml-auto mr-2 hidden-sm-and-down"
            :disabled="uiFrozen && isScanningProbePresent"
            @click="showCalibrationDialog = true"
          >
            <v-icon class="mr-1">mdi-record</v-icon>
            Calibrate Scanning Probe
          </v-btn>
        </v-tabs>
        <v-tabs-items v-model="tab">
          <!-- Probe Chart Tab -->
          <v-tab-item value="probechart">
            <div class="content">
              <v-alert v-if="!isScanningProbePresent" type="info">
                No scanning probe connected. Please attach a scanning probe.
              </v-alert>
              <div v-else class="flex-grow-1">
                <probevalues-chart/>
              </div>
            </div>
          </v-tab-item>
          <!-- Calibration Tab -->
          <v-tab-item value="calibration">
            <div class="content">
              <div class="flex-grow-1">
                <scanning-probe-calibration-plot/>
              </div>
            </div>
          </v-tab-item>
        </v-tabs-items>
      </v-card>
    </v-col>
    <calibrate-scanning-probe-dialog :shown.sync="showCalibrationDialog" />
  </v-row>
</template>

<script lang="ts">
import ProbeValuesChart from "./ProbeValuesChart.vue";
import CalibrateScanningProbeDialog from "./CalibrateScanningProbeDialog.vue";
import ScanningProbeCalibrationPlot from "./ScanningProbeCalibrationPlot.vue";
import store from "@/store";
import { Probe, ProbeType } from "@duet3d/objectmodel/dist/sensors/Probe";

function checkScanningProbePresent() {
  return (
    store.state.machine.model.sensors.probes.filter(
      (probe: Probe | null) => probe && probe.type === ProbeType.scanningAnalog
    ).length > 0
  );
}

export default {
  name: "ScanningProbe",
  components: {
    "probevalues-chart": ProbeValuesChart,
    "calibrate-scanning-probe-dialog": CalibrateScanningProbeDialog,
    "scanning-probe-calibration-plot": ScanningProbeCalibrationPlot,
  },
  data() {
    return {
      tab: null as string | null,
      showCalibrationDialog: false as boolean,
    };
  },
  computed: {
    uiFrozen(): boolean {
      return store.getters["uiFrozen"];
    },

    isScanningProbePresent(): boolean {
      return checkScanningProbePresent();
    },
  },
  methods: {
  },
  mounted() {
  },
};
</script>
