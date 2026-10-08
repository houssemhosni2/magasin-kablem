import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Categorie, Produit, ProduitService } from '../../services/produit';

@Component({
  selector: 'app-produits',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './produits.html',
  styleUrl: './produits.css',
})
export class Produits implements OnInit {
  private produitService = inject(ProduitService);

  produits = signal<Produit[]>([]);
  categories = signal<Categorie[]>([]);
  erreur = signal('');
  editionId: number | null = null;
  form: Produit = this.formVide();

  ngOnInit(): void {
    this.charger();
    this.produitService.getCategories().subscribe({
      next: (data) => this.categories.set(data),
    });
  }

  charger(): void {
    this.produitService.getProduits().subscribe({
      next: (data) => {
        this.produits.set(data);
        this.erreur.set('');
      },
      error: () => this.erreur.set("Impossible de contacter l'API (backend lancé ? MySQL configuré ?)"),
    });
  }

  enregistrer(): void {
    if (!this.form.nom) return;
    const requete = this.editionId
      ? this.produitService.modifierProduit(this.editionId, this.form)
      : this.produitService.ajouterProduit(this.form);
    requete.subscribe(() => {
      this.annuler();
      this.charger();
    });
  }

  modifier(p: Produit): void {
    this.editionId = p.id!;
    this.form = { ...p };
  }

  supprimer(p: Produit): void {
    if (!confirm(`Supprimer "${p.nom}" ?`)) return;
    this.produitService.supprimerProduit(p.id!).subscribe(() => this.charger());
  }

  annuler(): void {
    this.editionId = null;
    this.form = this.formVide();
  }

  private formVide(): Produit {
    return { nom: '', description: '', prix: 0, quantite: 0, categorie_id: null };
  }
}
