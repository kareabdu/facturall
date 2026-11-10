export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      articles: {
        Row: {
          actif: boolean
          compte_vente_id: string | null
          created_at: string
          designation: string
          entreprise_id: string
          id: string
          prix_vente: number
          reference: string | null
          taux_tva_id: string | null
          type: string
          unite: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          compte_vente_id?: string | null
          created_at?: string
          designation: string
          entreprise_id: string
          id?: string
          prix_vente?: number
          reference?: string | null
          taux_tva_id?: string | null
          type?: string
          unite?: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          compte_vente_id?: string | null
          created_at?: string
          designation?: string
          entreprise_id?: string
          id?: string
          prix_vente?: number
          reference?: string | null
          taux_tva_id?: string | null
          type?: string
          unite?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_compte_vente_id_entreprise_id_fkey"
            columns: ["compte_vente_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "articles_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_taux_tva_id_entreprise_id_fkey"
            columns: ["taux_tva_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "taux_tva"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      boutiques: {
        Row: {
          active: boolean
          adresse: string | null
          code: string
          created_at: string
          entreprise_id: string
          est_principale: boolean
          id: string
          nom: string
          telephone: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          active?: boolean
          adresse?: string | null
          code: string
          created_at?: string
          entreprise_id: string
          est_principale?: boolean
          id?: string
          nom: string
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          active?: boolean
          adresse?: string | null
          code?: string
          created_at?: string
          entreprise_id?: string
          est_principale?: boolean
          id?: string
          nom?: string
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boutiques_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          actif: boolean
          adresse: string | null
          code: string
          created_at: string
          created_by: string | null
          delai_paiement_jours: number | null
          email: string | null
          entreprise_id: string
          id: string
          identifiant_fiscal: string | null
          nom: string
          notes: string | null
          rccm: string | null
          telephone: string | null
          type: string
          updated_at: string
          ville: string | null
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          delai_paiement_jours?: number | null
          email?: string | null
          entreprise_id: string
          id?: string
          identifiant_fiscal?: string | null
          nom: string
          notes?: string | null
          rccm?: string | null
          telephone?: string | null
          type?: string
          updated_at?: string
          ville?: string | null
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          delai_paiement_jours?: number | null
          email?: string | null
          entreprise_id?: string
          id?: string
          identifiant_fiscal?: string | null
          nom?: string
          notes?: string | null
          rccm?: string | null
          telephone?: string | null
          type?: string
          updated_at?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      comptes: {
        Row: {
          actif: boolean
          classe: number | null
          created_at: string
          entreprise_id: string
          id: string
          libelle: string
          mouvementable: boolean
          numero: string
          origine: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          classe?: number | null
          created_at?: string
          entreprise_id: string
          id?: string
          libelle: string
          mouvementable?: boolean
          numero: string
          origine?: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          classe?: number | null
          created_at?: string
          entreprise_id?: string
          id?: string
          libelle?: string
          mouvementable?: boolean
          numero?: string
          origine?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comptes_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_achat: {
        Row: {
          boutique_id: string
          created_at: string
          created_by: string | null
          date_document: string
          date_echeance: string | null
          document_origine_id: string | null
          ecriture_id: string | null
          entreprise_id: string
          fournisseur_id: string
          id: string
          montant_avoir: number
          montant_paye: number
          notes: string | null
          numero: string | null
          numero_fournisseur: string | null
          statut: string
          total_ht: number
          total_ttc: number
          total_tva: number
          type: string
          updated_at: string
          valide_le: string | null
          valide_par: string | null
        }
        Insert: {
          boutique_id: string
          created_at?: string
          created_by?: string | null
          date_document?: string
          date_echeance?: string | null
          document_origine_id?: string | null
          ecriture_id?: string | null
          entreprise_id: string
          fournisseur_id: string
          id?: string
          montant_avoir?: number
          montant_paye?: number
          notes?: string | null
          numero?: string | null
          numero_fournisseur?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          type: string
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Update: {
          boutique_id?: string
          created_at?: string
          created_by?: string | null
          date_document?: string
          date_echeance?: string | null
          document_origine_id?: string | null
          ecriture_id?: string | null
          entreprise_id?: string
          fournisseur_id?: string
          id?: string
          montant_avoir?: number
          montant_paye?: number
          notes?: string | null
          numero?: string | null
          numero_fournisseur?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          type?: string
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_achat_boutique_id_entreprise_id_fkey"
            columns: ["boutique_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "documents_achat_document_origine_id_entreprise_id_fkey"
            columns: ["document_origine_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "documents_achat"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "documents_achat_ecriture_id_entreprise_id_fkey"
            columns: ["ecriture_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "documents_achat_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_achat_fournisseur_id_entreprise_id_fkey"
            columns: ["fournisseur_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      documents_vente: {
        Row: {
          boutique_id: string
          client_id: string
          created_at: string
          created_by: string | null
          date_document: string
          date_echeance: string | null
          document_origine_id: string | null
          ecriture_id: string | null
          entreprise_id: string
          id: string
          montant_avoir: number
          montant_regle: number
          notes: string | null
          numero: string | null
          reference_client: string | null
          statut: string
          total_ht: number
          total_ttc: number
          total_tva: number
          type: string
          updated_at: string
          valide_le: string | null
          valide_par: string | null
        }
        Insert: {
          boutique_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          date_document?: string
          date_echeance?: string | null
          document_origine_id?: string | null
          ecriture_id?: string | null
          entreprise_id: string
          id?: string
          montant_avoir?: number
          montant_regle?: number
          notes?: string | null
          numero?: string | null
          reference_client?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          type: string
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Update: {
          boutique_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          date_document?: string
          date_echeance?: string | null
          document_origine_id?: string | null
          ecriture_id?: string | null
          entreprise_id?: string
          id?: string
          montant_avoir?: number
          montant_regle?: number
          notes?: string | null
          numero?: string | null
          reference_client?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          type?: string
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_vente_boutique_id_entreprise_id_fkey"
            columns: ["boutique_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "documents_vente_client_id_entreprise_id_fkey"
            columns: ["client_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "documents_vente_document_origine_id_entreprise_id_fkey"
            columns: ["document_origine_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "documents_vente"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "documents_vente_ecriture_id_entreprise_id_fkey"
            columns: ["ecriture_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "documents_vente_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      ecriture_lignes: {
        Row: {
          client_id: string | null
          compte_id: string
          credit: number
          debit: number
          ecriture_id: string
          entreprise_id: string
          fournisseur_id: string | null
          id: string
          libelle: string | null
          ordre: number
        }
        Insert: {
          client_id?: string | null
          compte_id: string
          credit?: number
          debit?: number
          ecriture_id: string
          entreprise_id: string
          fournisseur_id?: string | null
          id?: string
          libelle?: string | null
          ordre: number
        }
        Update: {
          client_id?: string | null
          compte_id?: string
          credit?: number
          debit?: number
          ecriture_id?: string
          entreprise_id?: string
          fournisseur_id?: string | null
          id?: string
          libelle?: string | null
          ordre?: number
        }
        Relationships: [
          {
            foreignKeyName: "ecriture_lignes_client_id_entreprise_id_fkey"
            columns: ["client_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "ecriture_lignes_compte_id_entreprise_id_fkey"
            columns: ["compte_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "ecriture_lignes_ecriture_id_entreprise_id_fkey"
            columns: ["ecriture_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "ecriture_lignes_fournisseur_id_entreprise_id_fkey"
            columns: ["fournisseur_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      ecritures: {
        Row: {
          boutique_id: string | null
          contre_passation_de: string | null
          created_at: string
          created_by: string | null
          date_ecriture: string
          entreprise_id: string
          exercice_id: string
          id: string
          journal_id: string
          libelle: string
          numero: string | null
          origine: string
          reference: string | null
          statut: string
          total: number
          updated_at: string
          validee_le: string | null
          validee_par: string | null
        }
        Insert: {
          boutique_id?: string | null
          contre_passation_de?: string | null
          created_at?: string
          created_by?: string | null
          date_ecriture: string
          entreprise_id: string
          exercice_id: string
          id?: string
          journal_id: string
          libelle: string
          numero?: string | null
          origine?: string
          reference?: string | null
          statut?: string
          total?: number
          updated_at?: string
          validee_le?: string | null
          validee_par?: string | null
        }
        Update: {
          boutique_id?: string | null
          contre_passation_de?: string | null
          created_at?: string
          created_by?: string | null
          date_ecriture?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          journal_id?: string
          libelle?: string
          numero?: string | null
          origine?: string
          reference?: string | null
          statut?: string
          total?: number
          updated_at?: string
          validee_le?: string | null
          validee_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecritures_boutique_id_entreprise_id_fkey"
            columns: ["boutique_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "ecritures_contre_passation_de_entreprise_id_fkey"
            columns: ["contre_passation_de", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "ecritures_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecritures_exercice_id_entreprise_id_fkey"
            columns: ["exercice_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "ecritures_journal_id_entreprise_id_fkey"
            columns: ["journal_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "journaux"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      entreprises: {
        Row: {
          adresse: string | null
          created_at: string
          created_by: string | null
          devise: string
          email: string | null
          forme_juridique: string | null
          id: string
          identifiant_fiscal: string | null
          mode_comptable: string
          pays: string
          raison_sociale: string
          rccm: string | null
          sigle: string | null
          systeme_comptable: string
          telephone: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          created_at?: string
          created_by?: string | null
          devise?: string
          email?: string | null
          forme_juridique?: string | null
          id?: string
          identifiant_fiscal?: string | null
          mode_comptable?: string
          pays: string
          raison_sociale: string
          rccm?: string | null
          sigle?: string | null
          systeme_comptable?: string
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          created_at?: string
          created_by?: string | null
          devise?: string
          email?: string | null
          forme_juridique?: string | null
          id?: string
          identifiant_fiscal?: string | null
          mode_comptable?: string
          pays?: string
          raison_sociale?: string
          rccm?: string | null
          sigle?: string | null
          systeme_comptable?: string
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: []
      }
      exercices: {
        Row: {
          cloture_le: string | null
          cloture_par: string | null
          code: string
          created_at: string
          date_debut: string
          date_fin: string
          entreprise_id: string
          id: string
          statut: string
        }
        Insert: {
          cloture_le?: string | null
          cloture_par?: string | null
          code: string
          created_at?: string
          date_debut: string
          date_fin: string
          entreprise_id: string
          id?: string
          statut?: string
        }
        Update: {
          cloture_le?: string | null
          cloture_par?: string | null
          code?: string
          created_at?: string
          date_debut?: string
          date_fin?: string
          entreprise_id?: string
          id?: string
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercices_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      fournisseurs: {
        Row: {
          actif: boolean
          adresse: string | null
          code: string
          created_at: string
          created_by: string | null
          delai_paiement_jours: number | null
          email: string | null
          entreprise_id: string
          id: string
          identifiant_fiscal: string | null
          nom: string
          notes: string | null
          rccm: string | null
          telephone: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          delai_paiement_jours?: number | null
          email?: string | null
          entreprise_id: string
          id?: string
          identifiant_fiscal?: string | null
          nom: string
          notes?: string | null
          rccm?: string | null
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          delai_paiement_jours?: number | null
          email?: string | null
          entreprise_id?: string
          id?: string
          identifiant_fiscal?: string | null
          nom?: string
          notes?: string | null
          rccm?: string | null
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fournisseurs_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          acceptee_le: string | null
          boutique_ids: string[]
          created_at: string
          email: string
          entreprise_id: string
          expire_le: string
          id: string
          invite_par: string | null
          role: Database["public"]["Enums"]["role_membre"]
          toutes_boutiques: boolean
        }
        Insert: {
          acceptee_le?: string | null
          boutique_ids?: string[]
          created_at?: string
          email: string
          entreprise_id: string
          expire_le?: string
          id?: string
          invite_par?: string | null
          role: Database["public"]["Enums"]["role_membre"]
          toutes_boutiques?: boolean
        }
        Update: {
          acceptee_le?: string | null
          boutique_ids?: string[]
          created_at?: string
          email?: string
          entreprise_id?: string
          expire_le?: string
          id?: string
          invite_par?: string | null
          role?: Database["public"]["Enums"]["role_membre"]
          toutes_boutiques?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "invitations_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      journaux: {
        Row: {
          actif: boolean
          code: string
          compte_tresorerie_id: string | null
          created_at: string
          entreprise_id: string
          id: string
          libelle: string
          type: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          code: string
          compte_tresorerie_id?: string | null
          created_at?: string
          entreprise_id: string
          id?: string
          libelle: string
          type: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          code?: string
          compte_tresorerie_id?: string | null
          created_at?: string
          entreprise_id?: string
          id?: string
          libelle?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journaux_compte_tresorerie_id_entreprise_id_fkey"
            columns: ["compte_tresorerie_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "journaux_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      lignes_documents_achat: {
        Row: {
          article_id: string | null
          compte_charge_id: string
          designation: string
          document_id: string
          entreprise_id: string
          id: string
          montant_ht: number
          montant_ttc: number
          montant_tva: number
          ordre: number
          prix_unitaire: number
          quantite: number
          remise_pct: number
          taux_tva: number
          taux_tva_id: string | null
          unite: string | null
        }
        Insert: {
          article_id?: string | null
          compte_charge_id: string
          designation: string
          document_id: string
          entreprise_id: string
          id?: string
          montant_ht: number
          montant_ttc: number
          montant_tva: number
          ordre: number
          prix_unitaire: number
          quantite: number
          remise_pct?: number
          taux_tva?: number
          taux_tva_id?: string | null
          unite?: string | null
        }
        Update: {
          article_id?: string | null
          compte_charge_id?: string
          designation?: string
          document_id?: string
          entreprise_id?: string
          id?: string
          montant_ht?: number
          montant_ttc?: number
          montant_tva?: number
          ordre?: number
          prix_unitaire?: number
          quantite?: number
          remise_pct?: number
          taux_tva?: number
          taux_tva_id?: string | null
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lignes_documents_achat_article_id_entreprise_id_fkey"
            columns: ["article_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "lignes_documents_achat_compte_charge_id_entreprise_id_fkey"
            columns: ["compte_charge_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "lignes_documents_achat_document_id_entreprise_id_fkey"
            columns: ["document_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "documents_achat"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "lignes_documents_achat_taux_tva_id_entreprise_id_fkey"
            columns: ["taux_tva_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "taux_tva"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      lignes_documents_vente: {
        Row: {
          article_id: string | null
          compte_vente_id: string
          designation: string
          document_id: string
          entreprise_id: string
          id: string
          montant_ht: number
          montant_ttc: number
          montant_tva: number
          ordre: number
          prix_unitaire: number
          quantite: number
          remise_pct: number
          taux_tva: number
          taux_tva_id: string | null
          unite: string | null
        }
        Insert: {
          article_id?: string | null
          compte_vente_id: string
          designation: string
          document_id: string
          entreprise_id: string
          id?: string
          montant_ht: number
          montant_ttc: number
          montant_tva: number
          ordre: number
          prix_unitaire: number
          quantite: number
          remise_pct?: number
          taux_tva?: number
          taux_tva_id?: string | null
          unite?: string | null
        }
        Update: {
          article_id?: string | null
          compte_vente_id?: string
          designation?: string
          document_id?: string
          entreprise_id?: string
          id?: string
          montant_ht?: number
          montant_ttc?: number
          montant_tva?: number
          ordre?: number
          prix_unitaire?: number
          quantite?: number
          remise_pct?: number
          taux_tva?: number
          taux_tva_id?: string | null
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lignes_documents_vente_article_id_entreprise_id_fkey"
            columns: ["article_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "lignes_documents_vente_compte_vente_id_entreprise_id_fkey"
            columns: ["compte_vente_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "lignes_documents_vente_document_id_entreprise_id_fkey"
            columns: ["document_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "documents_vente"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "lignes_documents_vente_taux_tva_id_entreprise_id_fkey"
            columns: ["taux_tva_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "taux_tva"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      membres: {
        Row: {
          actif: boolean
          created_at: string
          entreprise_id: string
          id: string
          role: Database["public"]["Enums"]["role_membre"]
          toutes_boutiques: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          entreprise_id: string
          id?: string
          role: Database["public"]["Enums"]["role_membre"]
          toutes_boutiques?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          entreprise_id?: string
          id?: string
          role?: Database["public"]["Enums"]["role_membre"]
          toutes_boutiques?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membres_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      membres_boutiques: {
        Row: {
          boutique_id: string
          created_at: string
          entreprise_id: string
          membre_id: string
        }
        Insert: {
          boutique_id: string
          created_at?: string
          entreprise_id: string
          membre_id: string
        }
        Update: {
          boutique_id?: string
          created_at?: string
          entreprise_id?: string
          membre_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membres_boutiques_boutique_id_entreprise_id_fkey"
            columns: ["boutique_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "membres_boutiques_membre_id_entreprise_id_fkey"
            columns: ["membre_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "membres"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      paiements_fournisseurs: {
        Row: {
          boutique_id: string
          created_at: string
          created_by: string | null
          date_paiement: string
          document_id: string
          ecriture_id: string
          entreprise_id: string
          fournisseur_id: string
          id: string
          journal_id: string
          mode: string
          montant: number
          reference: string | null
        }
        Insert: {
          boutique_id: string
          created_at?: string
          created_by?: string | null
          date_paiement: string
          document_id: string
          ecriture_id: string
          entreprise_id: string
          fournisseur_id: string
          id?: string
          journal_id: string
          mode: string
          montant: number
          reference?: string | null
        }
        Update: {
          boutique_id?: string
          created_at?: string
          created_by?: string | null
          date_paiement?: string
          document_id?: string
          ecriture_id?: string
          entreprise_id?: string
          fournisseur_id?: string
          id?: string
          journal_id?: string
          mode?: string
          montant?: number
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paiements_fournisseurs_boutique_id_entreprise_id_fkey"
            columns: ["boutique_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "paiements_fournisseurs_document_id_entreprise_id_fkey"
            columns: ["document_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "documents_achat"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "paiements_fournisseurs_ecriture_id_entreprise_id_fkey"
            columns: ["ecriture_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "paiements_fournisseurs_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paiements_fournisseurs_fournisseur_id_entreprise_id_fkey"
            columns: ["fournisseur_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "paiements_fournisseurs_journal_id_entreprise_id_fkey"
            columns: ["journal_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "journaux"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      parametres_achat: {
        Row: {
          compte_achats_biens_id: string
          compte_achats_services_id: string
          compte_fournisseurs_id: string
          delai_paiement_jours: number
          entreprise_id: string
          journal_achats_id: string
          updated_at: string
        }
        Insert: {
          compte_achats_biens_id: string
          compte_achats_services_id: string
          compte_fournisseurs_id: string
          delai_paiement_jours?: number
          entreprise_id: string
          journal_achats_id: string
          updated_at?: string
        }
        Update: {
          compte_achats_biens_id?: string
          compte_achats_services_id?: string
          compte_fournisseurs_id?: string
          delai_paiement_jours?: number
          entreprise_id?: string
          journal_achats_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parametres_achat_compte_achats_biens_id_entreprise_id_fkey"
            columns: ["compte_achats_biens_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "parametres_achat_compte_achats_services_id_entreprise_id_fkey"
            columns: ["compte_achats_services_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "parametres_achat_compte_fournisseurs_id_entreprise_id_fkey"
            columns: ["compte_fournisseurs_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "parametres_achat_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: true
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parametres_achat_journal_achats_id_entreprise_id_fkey"
            columns: ["journal_achats_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "journaux"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      parametres_vente: {
        Row: {
          compte_clients_id: string
          compte_ventes_biens_id: string
          compte_ventes_services_id: string
          delai_paiement_jours: number
          entreprise_id: string
          journal_ventes_id: string
          mentions_facture: string | null
          updated_at: string
        }
        Insert: {
          compte_clients_id: string
          compte_ventes_biens_id: string
          compte_ventes_services_id: string
          delai_paiement_jours?: number
          entreprise_id: string
          journal_ventes_id: string
          mentions_facture?: string | null
          updated_at?: string
        }
        Update: {
          compte_clients_id?: string
          compte_ventes_biens_id?: string
          compte_ventes_services_id?: string
          delai_paiement_jours?: number
          entreprise_id?: string
          journal_ventes_id?: string
          mentions_facture?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parametres_vente_compte_clients_id_entreprise_id_fkey"
            columns: ["compte_clients_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "parametres_vente_compte_ventes_biens_id_entreprise_id_fkey"
            columns: ["compte_ventes_biens_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "parametres_vente_compte_ventes_services_id_entreprise_id_fkey"
            columns: ["compte_ventes_services_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "parametres_vente_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: true
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parametres_vente_journal_ventes_id_entreprise_id_fkey"
            columns: ["journal_ventes_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "journaux"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      profils: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nom_complet: string | null
          telephone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nom_complet?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nom_complet?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reglements: {
        Row: {
          boutique_id: string
          client_id: string
          created_at: string
          created_by: string | null
          date_reglement: string
          document_id: string
          ecriture_id: string
          entreprise_id: string
          id: string
          journal_id: string
          mode: string
          montant: number
          reference: string | null
        }
        Insert: {
          boutique_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          date_reglement: string
          document_id: string
          ecriture_id: string
          entreprise_id: string
          id?: string
          journal_id: string
          mode: string
          montant: number
          reference?: string | null
        }
        Update: {
          boutique_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          date_reglement?: string
          document_id?: string
          ecriture_id?: string
          entreprise_id?: string
          id?: string
          journal_id?: string
          mode?: string
          montant?: number
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reglements_boutique_id_entreprise_id_fkey"
            columns: ["boutique_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "reglements_client_id_entreprise_id_fkey"
            columns: ["client_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "reglements_document_id_entreprise_id_fkey"
            columns: ["document_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "documents_vente"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "reglements_ecriture_id_entreprise_id_fkey"
            columns: ["ecriture_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "reglements_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reglements_journal_id_entreprise_id_fkey"
            columns: ["journal_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "journaux"
            referencedColumns: ["id", "entreprise_id"]
          },
        ]
      }
      taux_tva: {
        Row: {
          actif: boolean
          compte_collecte_id: string | null
          compte_deductible_id: string | null
          created_at: string
          entreprise_id: string
          id: string
          libelle: string
          par_defaut: boolean
          taux: number
        }
        Insert: {
          actif?: boolean
          compte_collecte_id?: string | null
          compte_deductible_id?: string | null
          created_at?: string
          entreprise_id: string
          id?: string
          libelle: string
          par_defaut?: boolean
          taux: number
        }
        Update: {
          actif?: boolean
          compte_collecte_id?: string | null
          compte_deductible_id?: string | null
          created_at?: string
          entreprise_id?: string
          id?: string
          libelle?: string
          par_defaut?: boolean
          taux?: number
        }
        Relationships: [
          {
            foreignKeyName: "taux_tva_compte_collecte_id_entreprise_id_fkey"
            columns: ["compte_collecte_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "taux_tva_compte_deductible_id_entreprise_id_fkey"
            columns: ["compte_deductible_id", "entreprise_id"]
            isOneToOne: false
            referencedRelation: "comptes"
            referencedColumns: ["id", "entreprise_id"]
          },
          {
            foreignKeyName: "taux_tva_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accepter_invitations: { Args: never; Returns: number }
      annuler_devis: { Args: { p_devis_id: string }; Returns: undefined }
      balance_generale: {
        Args: {
          p_date_fin?: string
          p_entreprise_id: string
          p_exercice_id: string
        }
        Returns: {
          classe: number
          compte_id: string
          libelle: string
          numero: string
          solde_crediteur: number
          solde_debiteur: number
          total_credit: number
          total_debit: number
        }[]
      }
      contre_passer_ecriture: {
        Args: { p_date?: string; p_ecriture_id: string; p_libelle?: string }
        Returns: string
      }
      creer_avoir: {
        Args: { p_date?: string; p_facture_id: string; p_motif: string }
        Returns: string
      }
      creer_avoir_achat: {
        Args: {
          p_date?: string
          p_facture_id: string
          p_motif: string
          p_numero_fournisseur?: string
        }
        Returns: string
      }
      creer_compte: {
        Args: { p_entreprise_id: string; p_libelle: string; p_numero: string }
        Returns: string
      }
      creer_entreprise: {
        Args: {
          p_email?: string
          p_forme_juridique?: string
          p_identifiant_fiscal?: string
          p_nom_boutique?: string
          p_pays: string
          p_raison_sociale: string
          p_rccm?: string
          p_sigle?: string
          p_telephone?: string
          p_ville?: string
        }
        Returns: string
      }
      creer_exercice: {
        Args: {
          p_code: string
          p_date_debut: string
          p_date_fin: string
          p_entreprise_id: string
        }
        Returns: string
      }
      creer_journal: {
        Args: {
          p_code: string
          p_compte_tresorerie_id?: string
          p_entreprise_id: string
          p_libelle: string
          p_type: string
        }
        Returns: string
      }
      enregistrer_document_achat: {
        Args: {
          p_boutique_id: string
          p_date: string
          p_date_echeance?: string
          p_document_id?: string
          p_entreprise_id: string
          p_fournisseur_id: string
          p_lignes: Json
          p_notes?: string
          p_numero_fournisseur?: string
        }
        Returns: string
      }
      enregistrer_document_vente: {
        Args: {
          p_boutique_id: string
          p_client_id: string
          p_date: string
          p_date_echeance?: string
          p_document_id?: string
          p_entreprise_id: string
          p_lignes: Json
          p_notes?: string
          p_reference_client?: string
          p_type: string
        }
        Returns: string
      }
      enregistrer_ecriture: {
        Args: {
          p_boutique_id?: string
          p_date: string
          p_ecriture_id?: string
          p_entreprise_id: string
          p_journal_id: string
          p_libelle: string
          p_lignes: Json
          p_reference?: string
          p_valider?: boolean
        }
        Returns: string
      }
      enregistrer_operation_simple: {
        Args: {
          p_boutique_id?: string
          p_compte_id: string
          p_date: string
          p_entreprise_id: string
          p_journal_id: string
          p_libelle: string
          p_montant: number
          p_reference?: string
          p_sens: string
        }
        Returns: string
      }
      enregistrer_paiement_fournisseur: {
        Args: {
          p_date?: string
          p_document_id: string
          p_journal_id: string
          p_mode: string
          p_montant: number
          p_reference?: string
        }
        Returns: string
      }
      enregistrer_reglement: {
        Args: {
          p_date?: string
          p_document_id: string
          p_journal_id: string
          p_mode: string
          p_montant: number
          p_reference?: string
        }
        Returns: string
      }
      grand_livre: {
        Args: {
          p_compte_id: string
          p_date_fin?: string
          p_entreprise_id: string
          p_exercice_id: string
        }
        Returns: {
          credit: number
          date_ecriture: string
          debit: number
          ecriture_id: string
          journal_code: string
          libelle: string
          numero: string
          reference: string
          solde: number
        }[]
      }
      inviter_membre: {
        Args: {
          p_boutique_ids?: string[]
          p_email: string
          p_entreprise_id: string
          p_role: Database["public"]["Enums"]["role_membre"]
          p_toutes_boutiques?: boolean
        }
        Returns: string
      }
      membres_entreprise: {
        Args: { p_entreprise_id: string }
        Returns: {
          actif: boolean
          boutique_ids: string[]
          created_at: string
          email: string
          membre_id: string
          nom_complet: string
          role: Database["public"]["Enums"]["role_membre"]
          toutes_boutiques: boolean
          user_id: string
        }[]
      }
      mes_entreprises: {
        Args: never
        Returns: {
          entreprise_id: string
          mode_comptable: string
          pays: string
          raison_sociale: string
          role: Database["public"]["Enums"]["role_membre"]
          sigle: string
          toutes_boutiques: boolean
        }[]
      }
      modifier_membre: {
        Args: {
          p_boutique_ids?: string[]
          p_membre_id: string
          p_role: Database["public"]["Enums"]["role_membre"]
          p_toutes_boutiques: boolean
        }
        Returns: undefined
      }
      situation_clients: {
        Args: { p_entreprise_id: string }
        Returns: {
          client_id: string
          echu: number
          nb_factures: number
          reste_du: number
          total_avoir: number
          total_facture: number
          total_regle: number
        }[]
      }
      situation_fournisseurs: {
        Args: { p_entreprise_id: string }
        Returns: {
          echu: number
          fournisseur_id: string
          nb_factures: number
          reste_a_payer: number
          total_avoir: number
          total_facture: number
          total_paye: number
        }[]
      }
      supprimer_brouillon: {
        Args: { p_ecriture_id: string }
        Returns: undefined
      }
      supprimer_document_achat: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      supprimer_document_vente: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      transformer_devis: { Args: { p_devis_id: string }; Returns: string }
      valider_document_achat: {
        Args: { p_document_id: string; p_paiement?: Json }
        Returns: string
      }
      valider_document_vente: {
        Args: { p_document_id: string; p_reglement?: Json }
        Returns: string
      }
      valider_ecriture: { Args: { p_ecriture_id: string }; Returns: string }
    }
    Enums: {
      role_membre:
        | "proprietaire"
        | "admin"
        | "comptable"
        | "gestionnaire"
        | "vendeur"
        | "lecteur"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      role_membre: [
        "proprietaire",
        "admin",
        "comptable",
        "gestionnaire",
        "vendeur",
        "lecteur",
      ],
    },
  },
} as const
