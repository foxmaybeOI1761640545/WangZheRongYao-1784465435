<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { cropTypeToLabel } from '../domain/cropTypes.js'

defineProps({
  server: { type: Object, required: true },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])
const cancelButton = ref(null)

onMounted(() => void nextTick(() => cancelButton.value?.focus()))
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop farm-cycle-reset-backdrop">
      <section
        class="modal farm-cycle-reset-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="farm-cycle-reset-title"
        aria-describedby="farm-cycle-reset-description"
      >
        <div class="modal-heading">
          <div>
            <span class="section-kicker">Next farm cycle</span>
            <h3 id="farm-cycle-reset-title">开始同作物下一轮？</h3>
          </div>
          <button
            class="icon-button"
            type="button"
            aria-label="关闭已收获并重新种植确认"
            :disabled="busy"
            @click="emit('close')"
          >
            ×
          </button>
        </div>

        <p class="farm-cycle-server">
          <strong>{{ server.serverName }}</strong>
          <span>{{ server.accountId || '未填写 ID' }}</span>
        </p>
        <p id="farm-cycle-reset-description">
          已确认收获，并继续种植 <strong>{{ cropTypeToLabel(server.cropType) }}</strong>。
        </p>
        <ul class="farm-cycle-reset-effects">
          <li>清除上一轮计算时间；</li>
          <li>取消上一轮浇水和收获提醒；</li>
          <li>保留当前作物类型；</li>
          <li>随后打开新一轮计算。</li>
        </ul>

        <div class="modal-actions">
          <button
            ref="cancelButton"
            class="button secondary"
            type="button"
            :disabled="busy"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            class="button primary"
            type="button"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy ? '正在开始下一轮…' : '已收获并开始下一轮' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
