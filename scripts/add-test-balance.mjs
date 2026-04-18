#!/usr/bin/env node

const SUPABASE_URL = 'https://lwnqqjqaiauiqyxebehd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3bnFxanFhaWF1aXF5eGViZWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY0NzYsImV4cCI6MjA5MTk0MjQ3Nn0.g6wrTI53TTKnT5OMX41cnv1S4fMsq_6WqkBUz9INH3A';

const TARGET_USERNAME = 'arina_neytor';
const TEST_BALANCE = 500;

console.log(`🔍 Поиск пользователя ${TARGET_USERNAME} и добавление ${TEST_BALANCE} звезд...\n`);

async function addTestBalance() {
  try {
    // Get all users
    console.log('1️⃣ Получение списка пользователей...');
    const usersRes = await fetch(`${SUPABASE_URL}/functions/v1/make-server-0dc2674a/admin/users`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const users = await usersRes.json();

    if (!usersRes.ok) {
      throw new Error(`Failed to get users: ${users.error}`);
    }

    console.log(`   Найдено ${users.length} пользователей`);

    // Find user by username
    let user = users.find(u => u.profile?.username === TARGET_USERNAME || u.profile?.first_name === TARGET_USERNAME);

    if (!user) {
      console.log(`   ❌ Пользователь ${TARGET_USERNAME} не найден`);
      console.log('   Создание нового пользователя...');

      // Create new user via user-init
      const newUserId = Date.now().toString(); // Simple ID generation
      const initRes = await fetch(`${SUPABASE_URL}/functions/v1/make-server-0dc2674a/user-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          id: newUserId,
          first_name: TARGET_USERNAME,
          username: TARGET_USERNAME
        })
      });

      if (!initRes.ok) {
        const error = await initRes.json();
        throw new Error(`Failed to init user: ${error.error}`);
      }

      console.log(`   ✅ Создан пользователь с ID: ${newUserId}`);
      user = { userId: newUserId, profile: { username: TARGET_USERNAME } };
    } else {
      console.log(`   ✅ Найден пользователь: ${user.profile?.username} (ID: ${user.userId})`);
    }

    // Update balance
    console.log(`\n2️⃣ Обновление баланса на ${TEST_BALANCE} звезд...`);
    const updateRes = await fetch(`${SUPABASE_URL}/functions/v1/make-server-0dc2674a/user/${user.userId}/balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ balance: TEST_BALANCE })
    });

    const result = await updateRes.json();

    if (!updateRes.ok) {
      throw new Error(`Failed to update balance: ${result.error}`);
    }

    console.log('   ✅ Баланс обновлен:', result);

    // Verify balance
    console.log('\n3️⃣ Проверка баланса...');
    const checkRes = await fetch(`${SUPABASE_URL}/functions/v1/make-server-0dc2674a/user/${user.userId}/balance`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const balance = await checkRes.json();
    console.log('   ✅ Текущий баланс:', balance);

    console.log('\n✅ ГОТОВО! Тестовый баланс добавлен.');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

addTestBalance();