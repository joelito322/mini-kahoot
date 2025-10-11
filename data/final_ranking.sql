-- Table to store final rankings for completed sessions
CREATE TABLE IF NOT EXISTS session_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  final_position INTEGER NOT NULL CHECK (final_position > 0),
  final_score INTEGER NOT NULL DEFAULT 0,
  total_answers INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  total_time_ms BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(session_id, participant_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_session_results_session_id ON session_results(session_id);
CREATE INDEX IF NOT EXISTS idx_session_results_participant_id ON session_results(participant_id);
CREATE INDEX IF NOT EXISTS idx_session_results_position ON session_results(session_id, final_position);

-- Update existing scores table policy to allow participants to view their own scores
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- Policy for participants to view scores from sessions they participated in
CREATE POLICY "Participants can view session scores" ON scores
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM session_participants
      WHERE user_id = auth.uid() AND session_id = scores.session_id
    )
  );

-- Policy for hosts to manage all scores
CREATE POLICY "Hosts can manage session scores" ON scores
  FOR ALL USING (
    session_id IN (
      SELECT id FROM sessions WHERE created_by = auth.uid()
    )
  );

-- Policies for session_results
ALTER TABLE session_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their session results" ON session_results
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM session_participants
      WHERE user_id = auth.uid() AND session_id = session_results.session_id
    )
  );

CREATE POLICY "Hosts can manage session results" ON session_results
  FOR ALL USING (
    session_id IN (
      SELECT id FROM sessions WHERE created_by = auth.uid()
    )
  );
