const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Connexion PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Initialiser la table
pool.query(`
  CREATE TABLE IF NOT EXISTS lieux (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    description TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    votes INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    par VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log('✅ Table lieux prête'))
  .catch(err => console.error('Erreur table:', err));

// GET tous les lieux
app.get('/lieux', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lieux ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST nouveau lieu
app.post('/lieux', async (req, res) => {
  try {
    const { nom, type, description, lat, lng, par, ville, categorie, sous_categorie } = req.body;
    if (!nom || !lat || !lng) return res.status(400).json({ error: 'Champs manquants' });
    const result = await pool.query(
      'INSERT INTO lieux (nom, type, description, lat, lng, par, ville, categorie, sous_categorie) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [nom, type, description, lat, lng, par || 'Anonyme', ville || null, categorie || null, sous_categorie || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST voter
app.post('/lieux/:id/vote', async (req, res) => {
  try {
    const { action } = req.body;
    const id = req.params.id;
    let query;
    if (action === 'confirmer') {
      query = 'UPDATE lieux SET votes = votes + 1, status = CASE WHEN votes + 1 >= 5 THEN \'validated\' ELSE status END WHERE id = $1 RETURNING *';
    } else {
      query = 'UPDATE lieux SET votes = votes - 1, status = CASE WHEN votes - 1 <= -3 THEN \'contested\' ELSE status END WHERE id = $1 RETURNING *';
    }
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lieu non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET classement
app.get('/classement', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT par, COUNT(*) as lieux, SUM(votes) as votes_total FROM lieux GROUP BY par ORDER BY votes_total DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// GET /alertes - récupérer alertes actives
app.get('/alertes', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM alertes WHERE actif = true AND (expire_at IS NULL OR expire_at > NOW()) ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /alertes - soumettre une alerte
app.post('/alertes', async (req, res) => {
  const { type, lat, lng, par, description } = req.body;
  const durees = {
    'Embouteillage': 60,
    'Accident': 120,
    'Travaux': 1440,
    'Inondation': 360,
    'Contrôle police': 30,
    'Pénurie carburant': 180,
    'Nid de poule': 10080,
    'Arbre tombé': 240,
  };
  const minutes = durees[type] || 60;
  try {
    const result = await pool.query(
      "INSERT INTO alertes (type, lat, lng, par, description, expire_at) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 minute' * $6) RETURNING *",
      [type, lat, lng, par, description, minutes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /alertes/:id/vote - voter sur une alerte
app.post('/alertes/:id/vote', async (req, res) => {
  const { vote } = req.body;
  const colonne = vote === 'confirme' ? 'votes_confirme' : 'votes_infirme';
  try {
    const result = await pool.query(
      `UPDATE alertes SET ${colonne} = ${colonne} + 1 WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ KonoMap backend sur port ${PORT}`));