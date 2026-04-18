-- Supabase Database Schema for Crash Game
-- Run these SQL commands in your Supabase SQL editor

-- Enable Row Level Security (RLS) for all tables
-- Note: Adjust RLS policies based on your security requirements

-- User Profiles
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  avatar_url TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- User Balances
CREATE TABLE user_balances (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  balance DECIMAL(15,2) DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Stats
CREATE TABLE user_stats (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  games INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  max_multiplier DECIMAL(8,2) DEFAULT 0,
  total_bet DECIMAL(15,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User History
CREATE TABLE user_history (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'bet', 'cashout', etc.
  game TEXT DEFAULT 'crash',
  amount DECIMAL(15,2),
  multiplier DECIMAL(8,2),
  win_amount DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bets (current round)
CREATE TABLE bets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  username TEXT,
  amount DECIMAL(15,2) NOT NULL,
  status TEXT DEFAULT 'playing' CHECK (status IN ('playing', 'cashed_out', 'crashed')),
  round_id TEXT NOT NULL,
  multiplier DECIMAL(8,2),
  win_amount DECIMAL(15,2) DEFAULT 0,
  placed_at TIMESTAMPTZ DEFAULT NOW(),
  cashed_at TIMESTAMPTZ
);

-- Rounds (for persistence)
CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'countdown', 'in-progress', 'crashed')),
  countdown DECIMAL(3,1) DEFAULT 5.0,
  multiplier DECIMAL(8,2) DEFAULT 1.0,
  crash_point DECIMAL(8,2),
  start_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crash History (completed rounds)
CREATE TABLE crash_history (
  id SERIAL PRIMARY KEY,
  round_id TEXT REFERENCES rounds(id) ON DELETE CASCADE,
  crash_point DECIMAL(8,2) NOT NULL,
  total_bets INTEGER DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  cashed_out INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Overrides
CREATE TABLE admin_overrides (
  id SERIAL PRIMARY KEY,
  crash_point DECIMAL(8,2) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- Indexes for performance
CREATE INDEX idx_bets_round_id ON bets(round_id);
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_user_history_user_id ON user_history(user_id);
CREATE INDEX idx_user_history_created_at ON user_history(created_at DESC);
CREATE INDEX idx_rounds_status ON rounds(status);
CREATE INDEX idx_crash_history_created_at ON crash_history(created_at DESC);

-- Row Level Security Policies (adjust as needed)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE crash_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_overrides ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (allow authenticated users to access their own data)
-- Note: For production, implement proper authentication and authorization

-- Allow users to read their own profiles
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid()::text = user_id);

-- Allow users to read their own balance
CREATE POLICY "Users can view own balance" ON user_balances
  FOR SELECT USING (auth.uid()::text = user_id);

-- Allow users to update their own balance (for server-side operations)
CREATE POLICY "Server can update balances" ON user_balances
  FOR ALL USING (auth.role() = 'service_role');

-- Similar policies for other tables...
-- (Implement comprehensive RLS based on your auth strategy)

-- Initial data (optional)
INSERT INTO admin_overrides (crash_point, active) VALUES (2.5, false);