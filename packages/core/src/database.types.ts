// Généré depuis le projet Supabase « facturall » (ne pas modifier à la main).
// Pour régénérer : pnpm db:types

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
      ecriture_lignes: {
        Row: {
          compte_id: string
          credit: number
          debit: number
          ecriture_id: string
          entreprise_id: string
          id: string
          libelle: string | null
          ordre: number
        }
        Insert: {
          compte_id: string
          credit?: number
          debit?: number
          ecriture_id: string
          entreprise_id: string
          id?: string
          libelle?: string | null
          ordre: number
        }
        Update: {
          compte_id?: string
          credit?: number
          debit?: number
          ecriture_id?: string
          entreprise_id?: string
          id?: string
          libelle?: string | null
          ordre?: number
        }
        Relationships: [
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accepter_invitations: { Args: never; Returns: number }
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
      supprimer_brouillon: {
        Args: { p_ecriture_id: string }
        Returns: undefined
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
