import os
from flask import Flask, request, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv

# Încărcăm variabilele de mediu din .env.local al proiectului principal Next.js
load_dotenv(dotenv_path='../.env.local')

app = Flask(__name__)

# Initialize Supabase Client
url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
# Pentru backend (orchestrator Flask) folosim ROLE_KEY pentru a trece peste RLS si a scrie/modifica direct din "server"
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") 

if not url or not key:
    print("WARNING: Supabase variables are missing!")

supabase: Client = create_client(url, key) if url and key else None

@app.route('/health', methods=['GET'])
def health_check():
    """Ruta simpla de test pentru a verifica starea middleware-ului Flask."""
    return jsonify({"status": "ok", "message": "Flask Middleware is running."}), 200

@app.route('/api/test-db', methods=['GET'])
def test_db_connection():
    """Testeaza efectiv conexiunea cu Supabase."""
    if not supabase:
        return jsonify({"error": "Supabase client uninitialized"}), 500
    try:
        # Încearcă să extragă max 1 rând dintr-un tabel public (reports de ex.) 
        response = supabase.table('reports').select('*').limit(1).execute()
        return jsonify({
            "status": "success",
            "message": "Connected to Supabase DB successfully!",
            "data_sample": response.data
        }), 200
    except Exception as e:
        return jsonify({"error": "DB Test failed", "details": str(e)}), 500

@app.route('/api/reports', methods=['POST'])
def create_report():
    """Riceives citizen science photo metadata and saves to DB."""
    data = request.json
    try:
        # Convert lat/lng to PostGIS POINT
        # supabase-py will just insert it as WKT
        point_wkt = f"POINT({data['lng']} {data['lat']})"
        
        response = supabase.table('reports').insert({
            "user_id": data['user_id'],
            "location": point_wkt, 
            "image_url": data.get('image_url'),
            "smell_score": data.get('smell_score'),
            "water_flow": data.get('water_flow')
        }).execute()
        
        # Gamification / Reward Tokens logic - increment tokens for the user
        if data.get('user_id'):
            # Fetch user
            user_res = supabase.table('profiles').select('tokens').eq('id', data['user_id']).execute()
            if user_res.data:
                current_tokens = user_res.data[0]['tokens'] or 0
                supabase.table('profiles').update({'tokens': current_tokens + 10}).eq('id', data['user_id']).execute()
        
        return jsonify({"status": "success", "data": response.data}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/map/markers', methods=['GET'])
def get_map_markers():
    """Fetches GeoJSON-friendly points for Next.js/React Native."""
    try:
        anomalies = supabase.table('anomalies').select('id, anomaly_type, location, severity').eq('resolved', False).execute()
        reports = supabase.table('reports').select('id, location, status').eq('status', 'verified').execute()
        
        return jsonify({
            "anomalies": anomalies.data,
            "reports": reports.data
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/webhooks/copernicus', methods=['POST'])
def copernicus_webhook():
    """Receives triggers from the ML/Data Pipeline."""
    data = request.json
    try:
        point_wkt = f"POINT({data['lng']} {data['lat']})"
        response = supabase.table('anomalies').insert({
            "source": data['source'],
            "anomaly_type": data['anomaly_type'],
            "severity": data['severity'],
            "location": point_wkt
        }).execute()
        
        return jsonify({"status": "anomaly registered", "data": response.data}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)