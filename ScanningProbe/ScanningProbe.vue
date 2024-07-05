<style scoped>
.parent-container {
  /* height: 60vh; */
}

.content {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow-y: hidden;
}

.flex-grow-1 {
  flex: 1;
}
</style>

<template>
  <v-row class="parent-container">
    <v-col>
      <v-card>
        <!-- Tabs -->
        <v-tabs v-model="tab">
          <v-tab href="#probechart">
            <v-icon class="mr-1">mdi-file</v-icon>
            Probe Chart
          </v-tab>
          <v-tab href="#calibration">
            <v-icon class="mr-1">mdi-information</v-icon>
            Calibration
          </v-tab>
          <v-btn
            color="success"
            class="align-self-center ml-auto mr-2 hidden-sm-and-down"
            :disabled="uiFrozen"
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
              <div v-else>
                <probevalues-chart class="flex-grow-1" />
              </div>
            </div>
          </v-tab-item>
          <!-- Calibration Tab -->
          <v-tab-item value="calibration">
            <div class="content">
              <v-alert v-if="!isScanningProbePresent" type="info" class="mb-0">
                No scanning probe is connected. Please attach a scanning probe
                for calibration.
              </v-alert>
              <div v-if="isScanningProbePresent">
                <scanning-probe-calibration-plot class="flex-grow-1" />
              </div>
            </div>
          </v-tab-item>
        </v-tabs-items>
      </v-card>
    </v-col>
    <calibrate-scanning-probe-dialog :shown.sync="showCalibrationDialog" />
  </v-row>
</template>

<script>
import ProbeValuesChart from "./ProbeValuesChart.vue";
import { mapGetters } from "vuex";
import CalibrateScanningProbeDialog from "./CalibrateScanningProbeDialog.vue";
import ScanningProbeCalibrationPlot from "./ScanningProbeCalibrationPlot.vue";
import store from "@/store";

function checkScanningProbePresent() {
  return (
    store.state.machine.model.sensors.probes.filter(
      (probe) => probe.type === 11
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
      tab: null,
      showCalibrationDialog: false,

      files: [],
      filesLastModified: [],
      loadingFiles: false,
      filesError: null,
    };
  },
  computed: {
    ...mapGetters(["isConnected", "uiFrozen"]),
    isScanningProbePresent() {
      return checkScanningProbePresent();
    },
  },
  methods: {
    updateChartData() {},
  },
  mounted() {
    this.updateChartData();
  },
};
</script>
