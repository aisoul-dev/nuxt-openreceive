<script setup lang="ts">
const route = useRoute()
const { data, error, refresh } = await useFetch(`/api/checkout/${route.params.reference}`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
}
// Keep the checkout mounted after it settles on this page: it is the receipt.
const settledHere = ref(false)
function onSettled() {
  settledHere.value = true
  refresh()
}
</script>

<template>
  <div v-if="data">
    <h1>{{ data.title }}</h1>
    <p data-testid="state">
      {{ data.state === 'paid' ? 'Paid, thank you!' : 'Awaiting payment' }}
    </p>
    <!-- prefix comes from the module config; every other prop passes through -->
    <OpenReceiveCheckout
      v-if="data.state !== 'paid' || settledHere"
      :reference="data.reference"
      :resumable="true"
      :onSettled="onSettled"
    />
  </div>
</template>
