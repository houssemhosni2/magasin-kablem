-- Base de données du projet Magasin Kablem
CREATE DATABASE IF NOT EXISTS magasin_kablem CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE magasin_kablem;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS produits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  description TEXT,
  prix DECIMAL(10,2) NOT NULL DEFAULT 0,
  quantite INT NOT NULL DEFAULT 0,
  categorie_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE SET NULL
);

INSERT IGNORE INTO categories (id, nom) VALUES (1, 'Alimentation'), (2, 'Boissons'), (3, 'Hygiène');

INSERT IGNORE INTO produits (id, nom, description, prix, quantite, categorie_id) VALUES
  (1, 'Pâtes 500g', 'Pâtes alimentaires', 1.20, 50, 1),
  (2, 'Eau minérale 1.5L', 'Bouteille d''eau', 0.80, 120, 2),
  (3, 'Savon', 'Savon de toilette', 1.50, 30, 3);
