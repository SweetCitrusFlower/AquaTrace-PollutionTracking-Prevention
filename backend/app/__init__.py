import logging

from flask import Flask, jsonify
from flask_cors import CORS

from .config import Config
from .routes.map_data import map_data_bp
from .routes.reports import reports_bp
from .routes.webhooks import webhooks_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ALLOW_ORIGINS"]}},
    )

    logging.basicConfig(level=logging.INFO)

    app.register_blueprint(reports_bp, url_prefix="/api")
    app.register_blueprint(map_data_bp, url_prefix="/api")
    app.register_blueprint(webhooks_bp, url_prefix="/api")

    @app.get("/health")
    def health_check():
        return jsonify({"status": "ok", "service": "danubeguard-backend"}), 200

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Route not found."}), 404

    @app.errorhandler(500)
    def internal_error(_error):
        return jsonify({"error": "Internal server error."}), 500

    return app