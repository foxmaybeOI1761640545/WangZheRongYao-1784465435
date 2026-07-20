<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  CROP_OPTIONS,
  PLATFORM_OPTIONS,
  SYSTEM_OPTIONS,
} from '../composables/useAccountStore.js'

const props = defineProps({
  server: { type: Object, required: true },
  breadcrumbs: { type: Array, required: true },
})

const emit = defineEmits(['navigate-group', 'save', 'delete'])

const QUICK_FIELDS = {
  accountId: {
    label: '账号 ID',
    kind: 'text',
    placeholder: 'QQ号、微信标识或自定义账号 ID',
    description: '只修改账号 ID，其他账号参数保持不变。',
  },
  accountLevel: {
    label: '账号等级',
    kind: 'number',
    description: '请输入非负整数。',
  },
  battlePassLevel: {
    label: '战令等级',
    kind: 'number',
    description: '请输入当前赛季的战令等级。',
  },
  farmLevel: {
    label: '农场等级',
    kind: 'number',
    description: '请输入王者农场当前等级。',
  },
  cropType: {
    label: '当前种植作物类型',
    kind: 'crop',
    description: '仅支持记录 8、16、32 小时作物。',
  },
  epicSkins: {
    label: '史诗级以上皮肤',
    kind: 'textarea',
    placeholder: '每行填写一个，或使用逗号分隔',
    description: '可以一次修改完整皮肤列表。',
  },
}

const editing = ref(false)
const quickField = ref('')
const quickValue = ref('')
const form = reactive({
  serverName: '',
  system: 'android',
  platform: 'qq',
  accountId: '',
  accountLevel: 0,
  battlePassLevel: 0,
  farmLevel: 0,
  cropType: '8',
  epicSkins: '',
})

function syncForm() {
  Object.assign(form, {
    serverName: props.server.serverName,
    system: props.server.system,
    platform: props.server.platform,
    accountId: props.server.accountId,
    accountLevel: props.server.accountLevel,
    battlePassLevel: props.server.battlePassLevel,
    farmLevel: props.server.farmLevel,
    cropType: props.server.cropType,
    epicSkins: props.server.epicSkins,
  })
}

watch(() => props.server.id, () => {
  editing.value = false
  quickField.value = ''
  syncForm()
}, { immediate: true })

const systemLabel = computed(() => SYSTEM_OPTIONS.find((item) => item.value === props.server.system)?.label)
const platformLabel = computed(() => PLATFORM_OPTIONS.find((item) => item.value === props.server.platform)?.label)
const skinList = computed(() => String(props.server.epicSkins ?? '')
  .split(/[，,\n]/)
  .map((item) => item.trim())
  .filter(Boolean))
const quickMeta = computed(() => QUICK_FIELDS[quickField.value] ?? null)

function startEditing() {
  quickField.value = ''
  syncForm()
  editing.value = true
}

function cancelEditing() {
  syncForm()
  editing.value = false
}

function submit() {
  if (!form.serverName.trim()) return
  emit('save', { ...form })
  editing.value = false
}

function requestDelete() {
  emit('delete')
}

function openQuickEdit(field) {
  if (!QUICK_FIELDS[field]) return
  quickField.value = field
  quickValue.value = props.server[field] ?? ''
}

function closeQuickEdit() {
  quickField.value = ''
  quickValue.value = ''
}

function submitQuickEdit() {
  const field = quickField.value
  if (!QUICK_FIELDS[field]) return

  const payload = {
    serverName: props.server.serverName,
    system: props.server.system,
    platform: props.server.platform,
    accountId: props.server.accountId,
    accountLevel: props.server.accountLevel,
    battlePassLevel: props.server.battlePassLevel,
    farmLevel: props.server.farmLevel,
    cropType: props.server.cropType,
    epicSkins: props.server.epicSkins,
  }

  if (['accountLevel', 'battlePassLevel', 'farmLevel'].includes(field)) {
    const parsed = Number.parseInt(quickValue.value, 10)
    payload[field] = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  } else if (field === 'cropType') {
    payload.cropType = CROP_OPTIONS.includes(String(quickValue.value))
      ? String(quickValue.value)
      : props.server.cropType
  } else {
    payload[field] = String(quickValue.value ?? '').trim()
  }

  emit('save', payload)
  closeQuickEdit()
}

function quickCardKeydown(event, field) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  openQuickEdit(field)
}
</script>

<template>
  <section class="detail-view">
    <nav class="breadcrumbs" aria-label="当前位置">
      <template v-for="(item, index) in breadcrumbs" :key="item.id">
        <span v-if="index" class="breadcrumb-separator">/</span>
        <button
          v-if="item.type === 'group'"
          class="breadcrumb-button"
          type="button"
          @click="emit('navigate-group', item.id)"
        >
          {{ item.name }}
        </button>
        <span v-else class="breadcrumb-current">{{ item.serverName }}</span>
      </template>
    </nav>

    <header class="detail-hero">
      <div>
        <p class="eyebrow">Server account</p>
        <h2>{{ server.serverName }}</h2>
        <div class="tag-row large">
          <span class="tag">{{ systemLabel }}</span>
          <span class="tag accent">{{ platformLabel }}</span>
          <span class="tag crop">{{ server.cropType }} 小时作物</span>
        </div>
      </div>

      <button v-if="!editing" class="button primary" type="button" @click="startEditing">
        编辑资料
      </button>
    </header>

    <form v-if="editing" class="editor-panel" @submit.prevent="submit">
      <div class="section-heading compact">
        <div>
          <span class="section-kicker">Edit mode</span>
          <h3>修改账号参数</h3>
        </div>
      </div>

      <div class="form-grid">
        <label class="field full">
          <span>服务器（区）名称</span>
          <input v-model="form.serverName" required placeholder="例如：158区" />
        </label>

        <label class="field">
          <span>系统</span>
          <select v-model="form.system">
            <option v-for="item in SYSTEM_OPTIONS" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>登录平台</span>
          <select v-model="form.platform">
            <option v-for="item in PLATFORM_OPTIONS" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>

        <label class="field full">
          <span>账号 ID</span>
          <input v-model="form.accountId" placeholder="QQ号、微信标识或自定义账号 ID" />
        </label>

        <label class="field">
          <span>账号等级</span>
          <input v-model.number="form.accountLevel" type="number" min="0" inputmode="numeric" />
        </label>

        <label class="field">
          <span>战令等级</span>
          <input v-model.number="form.battlePassLevel" type="number" min="0" inputmode="numeric" />
        </label>

        <label class="field">
          <span>农场等级</span>
          <input v-model.number="form.farmLevel" type="number" min="0" inputmode="numeric" />
        </label>

        <label class="field">
          <span>当前作物类型</span>
          <select v-model="form.cropType">
            <option v-for="item in CROP_OPTIONS" :key="item" :value="item">
              {{ item }} 小时作物
            </option>
          </select>
        </label>

        <label class="field full">
          <span>史诗级以上皮肤</span>
          <textarea
            v-model="form.epicSkins"
            rows="5"
            placeholder="每行填写一个，或使用逗号分隔"
          ></textarea>
        </label>
      </div>

      <div class="editor-actions">
        <button class="button danger ghost" type="button" @click="requestDelete">删除区服</button>
        <span class="action-spacer"></span>
        <button class="button secondary" type="button" @click="cancelEditing">取消</button>
        <button class="button primary" type="submit">保存修改</button>
      </div>
    </form>

    <template v-else>
      <section class="detail-grid">
        <article
          class="detail-card identity-card quick-edit-card"
          role="button"
          tabindex="0"
          aria-label="修改账号 ID"
          @click="openQuickEdit('accountId')"
          @keydown="quickCardKeydown($event, 'accountId')"
        >
          <span class="quick-edit-hint">点击修改</span>
          <span class="detail-label">账号 ID</span>
          <strong>{{ server.accountId || '未填写' }}</strong>
          <p>{{ systemLabel }} · {{ platformLabel }} · {{ server.serverName }}</p>
        </article>

        <article
          class="detail-card level-card quick-edit-card"
          role="button"
          tabindex="0"
          aria-label="修改账号等级"
          @click="openQuickEdit('accountLevel')"
          @keydown="quickCardKeydown($event, 'accountLevel')"
        >
          <span class="quick-edit-hint">点击修改</span>
          <span class="detail-label">账号等级</span>
          <strong>{{ server.accountLevel }}</strong>
          <p>当前游戏账号等级</p>
        </article>

        <article
          class="detail-card level-card quick-edit-card"
          role="button"
          tabindex="0"
          aria-label="修改战令等级"
          @click="openQuickEdit('battlePassLevel')"
          @keydown="quickCardKeydown($event, 'battlePassLevel')"
        >
          <span class="quick-edit-hint">点击修改</span>
          <span class="detail-label">战令等级</span>
          <strong>{{ server.battlePassLevel }}</strong>
          <p>当前赛季战令进度</p>
        </article>

        <article
          class="detail-card level-card quick-edit-card"
          role="button"
          tabindex="0"
          aria-label="修改农场等级"
          @click="openQuickEdit('farmLevel')"
          @keydown="quickCardKeydown($event, 'farmLevel')"
        >
          <span class="quick-edit-hint">点击修改</span>
          <span class="detail-label">农场等级</span>
          <strong>{{ server.farmLevel }}</strong>
          <p>王者农场当前等级</p>
        </article>

        <article
          class="detail-card crop-card quick-edit-card"
          role="button"
          tabindex="0"
          aria-label="修改当前种植作物类型"
          @click="openQuickEdit('cropType')"
          @keydown="quickCardKeydown($event, 'cropType')"
        >
          <span class="quick-edit-hint">点击修改</span>
          <span class="detail-label">当前种植</span>
          <strong>{{ server.cropType }} 小时</strong>
          <p>仅记录 8 / 16 / 32 小时作物</p>
        </article>

        <article
          class="detail-card skins-card quick-edit-card"
          role="button"
          tabindex="0"
          aria-label="修改史诗级以上皮肤"
          @click="openQuickEdit('epicSkins')"
          @keydown="quickCardKeydown($event, 'epicSkins')"
        >
          <span class="quick-edit-hint">点击修改</span>
          <span class="detail-label">史诗级以上皮肤</span>
          <div v-if="skinList.length" class="skin-list">
            <span v-for="skin in skinList" :key="skin" class="skin-chip">{{ skin }}</span>
          </div>
          <p v-else>暂未记录皮肤</p>
        </article>
      </section>
    </template>

    <Teleport to="body">
      <div v-if="quickMeta" class="modal-backdrop" @click.self="closeQuickEdit">
        <form class="modal quick-edit-modal" @submit.prevent="submitQuickEdit">
          <div class="modal-heading">
            <div>
              <span class="section-kicker">Quick edit</span>
              <h3>修改{{ quickMeta.label }}</h3>
            </div>
            <button class="icon-button" type="button" aria-label="关闭" @click="closeQuickEdit">×</button>
          </div>

          <p class="quick-edit-value-preview">{{ quickMeta.description }}</p>

          <label class="field full">
            <span>{{ quickMeta.label }}</span>
            <input
              v-if="quickMeta.kind === 'text'"
              v-model="quickValue"
              autofocus
              :placeholder="quickMeta.placeholder"
            />
            <input
              v-else-if="quickMeta.kind === 'number'"
              v-model.number="quickValue"
              autofocus
              type="number"
              min="0"
              inputmode="numeric"
            />
            <select v-else-if="quickMeta.kind === 'crop'" v-model="quickValue" autofocus>
              <option v-for="item in CROP_OPTIONS" :key="item" :value="item">
                {{ item }} 小时作物
              </option>
            </select>
            <textarea
              v-else
              v-model="quickValue"
              autofocus
              rows="6"
              :placeholder="quickMeta.placeholder"
            ></textarea>
          </label>

          <div class="modal-actions">
            <button class="button secondary" type="button" @click="closeQuickEdit">取消</button>
            <button class="button primary" type="submit">保存此参数</button>
          </div>
        </form>
      </div>
    </Teleport>
  </section>
</template>
