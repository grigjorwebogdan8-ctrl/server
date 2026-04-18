const url = 'https://lwnqqjqaiauiqyxebehd.supabase.co/functions/v1/make-server-0dc2674a/admin/users';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3bnFxanFhaWF1eGViZWhkIiwicm9zZSI6ImFub24iLCJpYXQiOjE3NzYzNjY0NzYsImV4cCI6MjA5MTk0MjQ3Nn0.g6wrTI53TTKnT5OMX41cnv1S4fMsq_6WqkBUz9INH3A';

(async () => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json();
  console.log('status', res.status);
  console.log(JSON.stringify(data, null, 2));
})();
