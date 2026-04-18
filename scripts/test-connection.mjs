#!/usr/bin/env node

const SUPABASE_URL = 'https://lwnqqjqaiauiqyxebehd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3bnFxanFhaWF1aXF5eGViZWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY0NzYsImV4cCI6MjA5MTk0MjQ3Nn0.g6wrTI53TTKnT5OMX41cnv1S4fMsq_6WqkBUz9INH3A';

console.log('🔍 Проверка подключения к Supabase...\n');

async function testConnection() {
  try {
    // Test 1: Health check
    console.log('1️⃣ Проверка Health Check...');
    const healthRes = await fetch(`${SUPABASE_URL}/functions/v1/make-server-0dc2674a/health`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const health = await healthRes.json();
    console.log('   ✅ Health Check:', health);

    // Test 2: Get balance (test user)
    console.log('\n2️⃣ Проверка получения баланса...');
    const balanceRes = await fetch(`${SUPABASE_URL}/functions/v1/make-server-0dc2674a/user/12345/balance`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const balance = await balanceRes.json();
    console.log('   ✅ Баланс тестового пользователя:', balance);

    // Test 3: Create test balance
    console.log('\n3️⃣ Создание тестового баланса...');
    const createRes = await fetch(`${SUPABASE_URL}/functions/v1/make-server-0dc2674a/user/test999/balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ balance: 1000 })
    });
    const created = await createRes.json();
    console.log('   ✅ Баланс создан:', created);

    // Test 4: Read created balance
    console.log('\n4️⃣ Проверка созданного баланса...');
    const checkRes = await fetch(`${SUPABASE_URL}/functions/v1/make-server-0dc2674a/user/test999/balance`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const check = await checkRes.json();
    console.log('   ✅ Баланс прочитан:', check);

    console.log('\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Supabase работает корректно.');
    console.log('\n📊 Данные сохраняются в таблице: kv_store_0dc2674a');
    console.log('🔗 Dashboard: https://supabase.com/dashboard/project/lwnqqjqaiauiqyxebehd');

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    console.log('\n🔍 Возможные причины:');
    console.log('   1. Supabase Functions не запущены');
    console.log('   2. Неправильные ключи доступа');
    console.log('   3. CORS не настроен');
    console.log('\n📚 Смотрите DEBUG_SUPABASE.md для решения проблем');
  }
}

testConnection();
