export const CROP_TYPES = Object.freeze(['', '8', '16', '32'])

export const CROP_CODE_MAP = Object.freeze({
  '': '---',
  8: '8',
  16: '1',
  32: '3',
})

export function normaliseCropType(value) {
  const cropType = String(value ?? '').trim()
  return CROP_TYPES.includes(cropType) ? cropType : ''
}

export function cropTypeToCode(value) {
  return CROP_CODE_MAP[normaliseCropType(value)]
}

export function cropTypeToLabel(value) {
  const cropType = normaliseCropType(value)
  return cropType ? `${cropType} 小时作物` : '未记录'
}

export function nextCropType(value) {
  const cropType = normaliseCropType(value)
  const index = CROP_TYPES.indexOf(cropType)
  return CROP_TYPES[(index + 1) % CROP_TYPES.length]
}

export const CROP_OPTIONS = Object.freeze(
  CROP_TYPES.map((value) => Object.freeze({
    value,
    label: cropTypeToLabel(value),
  })),
)
