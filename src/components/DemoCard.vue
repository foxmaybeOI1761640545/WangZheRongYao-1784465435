<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  eyebrow: {
    type: String,
    default: 'Demo',
  },
})
</script>

<template>
  <article class="demo-card">
    <header class="demo-card__header">
      <p class="demo-card__eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
    </header>

    <div class="demo-card__content">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="demo-card__footer">
      <slot name="footer" />
    </footer>
  </article>
</template>
