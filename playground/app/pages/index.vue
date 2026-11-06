<script setup lang="ts">
async function buy() {
  const { id } = await $fetch<{ id: string }>('/api/orders', { method: 'POST' })
  await navigateTo(`/checkout/${id}`)
}
</script>

<template>
  <h1>Pro plan</h1>
  <p>1 month, 2100 sats</p>
  <button @click="buy">
    Buy
  </button>
</template>
