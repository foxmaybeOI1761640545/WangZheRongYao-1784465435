<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import {
  calculateFarmSchedule,
  formatFarmDuration,
  formatFarmTargetTime,
  getFarmCropConfig,
} from '../domain/farmCalculator.js'

const props = defineProps({
  server: { type: Object, required: true },
})

const emit = defineEmits(['close', 'save'])

const firstInput = ref(null)
const error = ref('')
const preview = ref(null)
const form = reactive({
  matureHours: '',
  matureMinutes: '',
  waterHours: '',
  waterMinutes: '',
})

const crop = computed(() => getFarmCropConfig(props.server.cropType))
const matureHourMax = computed(() => Math.floor((crop.value?.baseMinutes ?? 0) / 60))
const waterHourMax = computed(() => Math.floor((crop.value?.waterMaxMinutes ?? 0) / 60))

function reset({ focus = false } = {}) {
  Object.assign(form, {
    matureHours: '',
    matureMinutes: '',
    waterHours: '',
    waterMinutes: '',
  })
  error.value = ''
  preview.value = null
  if (focus) void nextTick(() => firstInput.value?.focus())
}

watch(() => props.server.id, () => reset({ focus: true }))
onMounted(() => void nextTick(() => firstInput.value?.focus()))

function readPart(value, name, max) {
  const text = String(value ?? '').trim()
  if (!text) return 0
  if (!/^\d+$/.test(text)) throw new Error(`${name}只能输入非负整数。`)
  const number = Number(text)
  if (number > max) throw new Error(`${name}不能超过 ${max}。`)
  return number
}

function calculate() {
  try {
    error.value = ''
    const matureHours = readPart(form.matureHours, '成熟剩余小时', matureHourMax.value)
    const matureMinutes = readPart(form.matureMinutes, '成熟剩余分钟', 59)
    const waterHours = readPart(form.waterHours, '水分剩余小时', waterHourMax.value)
    const waterMinutes = readPart(form.waterMinutes, '水分剩余分钟', 59)
    preview.value = calculateFarmSchedule({
      cropType: props.server.cropType,
      matureLeftMinutes: matureHours * 60 + matureMinutes,
      waterLeftMinutes: waterHours * 60 + waterMinutes,
      now: Date.now(),
    })
  } catch (exception) {
    preview.value = null
    error.value = exception instanceof Error ? exception.message : '计算失败，请检查输入。'
  }
}

function save() {
  if (!preview.value) return
  emit('save', preview.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop farm-calculator-backdrop" @click.self="emit('close')">
      <section
        class="modal farm-calculator-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="farm-calculator-title"
      >
        <div class="modal-heading">
          <div>
            <span class="section-kicker">Farm time</span>
            <h3 id="farm-calculator-title">农场时间计算</h3>
          </div>
          <button class="icon-button" type="button" aria-label="关闭农场时间计算" @click="emit('close')">×</button>
        </div>

        <p class="farm-calculator-context">
          <strong>{{ server.serverName }}</strong>
          <span>{{ server.accountId || '未填写 ID' }} · {{ crop?.cropName }}</span>
        </p>

        <form v-if="!preview" class="farm-calculator-form" @submit.prevent="calculate">
          <fieldset>
            <legend>当前成熟剩余</legend>
            <div class="farm-time-input-row">
              <label>
                <span>小时</span>
                <input
                  ref="firstInput"
                  v-model="form.matureHours"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  :max="matureHourMax"
                  placeholder="0"
                />
              </label>
              <label>
                <span>分钟</span>
                <input
                  v-model="form.matureMinutes"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="59"
                  placeholder="0"
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>当前水分剩余</legend>
            <div class="farm-time-input-row">
              <label>
                <span>小时</span>
                <input
                  v-model="form.waterHours"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  :max="waterHourMax"
                  placeholder="0"
                />
              </label>
              <label>
                <span>分钟</span>
                <input
                  v-model="form.waterMinutes"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="59"
                  placeholder="0"
                />
              </label>
            </div>
          </fieldset>

          <p class="farm-calculator-reference">
            基础成熟：{{ formatFarmDuration(crop?.baseMinutes) }} ·
            水分最大维持：{{ formatFarmDuration(crop?.waterMaxMinutes) }}
          </p>
          <p v-if="error" class="farm-calculator-error" role="alert">{{ error }}</p>

          <div class="modal-actions">
            <button class="button secondary" type="button" @click="emit('close')">取消</button>
            <button class="button primary" type="submit">计算</button>
          </div>
        </form>

        <section v-else class="farm-calculator-result" aria-live="polite">
          <dl>
            <div>
              <dt>理论最快成熟</dt>
              <dd>{{ formatFarmTargetTime(preview.fastestMatureAt, preview.calculatedAt) }}</dd>
            </div>
            <div>
              <dt>下一次浇水</dt>
              <dd>{{ formatFarmTargetTime(preview.nextWaterAt, preview.calculatedAt) }}</dd>
            </div>
            <div>
              <dt>当前预计成熟</dt>
              <dd>{{ formatFarmTargetTime(preview.reportedMatureAt, preview.calculatedAt) }}</dd>
            </div>
            <div>
              <dt>理论节省</dt>
              <dd>{{ formatFarmDuration(preview.savedMinutes) }}</dd>
            </div>
          </dl>

          <p class="farm-calculator-reference">
            基础成熟：{{ formatFarmDuration(preview.baseMinutes) }} ·
            水分最大维持：{{ formatFarmDuration(preview.waterMaxMinutes) }}
          </p>

          <div class="farm-result-actions">
            <button class="button primary" type="button" @click="save">保存结果</button>
            <button class="button secondary" type="button" @click="reset({ focus: true })">重新输入</button>
            <button class="button secondary" type="button" @click="emit('close')">取消</button>
          </div>
        </section>
      </section>
    </div>
  </Teleport>
</template>
