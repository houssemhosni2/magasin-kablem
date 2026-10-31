// Les tests utilisent TOUJOURS la base de test : jamais la base réelle.
// (dotenv ne remplace pas une variable déjà définie : cette valeur l'emporte sur .env)
process.env.DB_NAME = 'magasin_kablem_test';
process.env.DOTENV_CONFIG_QUIET = 'true';
