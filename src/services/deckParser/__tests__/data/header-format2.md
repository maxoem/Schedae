# Karte 1: Topologischer Raum / Topologie

## Vorderseite
Was ist eine **Topologie** $\mathcal{T}$ auf einer Menge $X$, was versteht man unter einem **topologischen Raum** $(X, \mathcal{T})$ und wie heißen die Elemente von $\mathcal{T}$?

## **Rückseite:**
Sei $X$ eine Menge, $\mathcal{P}(X)$ die Potenzmenge von $X$ und $\mathcal{T} \subseteq \mathcal{P}(X)$ ein Mengensystem (eine Kollektion von Teilmengen).
$\mathcal{T}$ heißt **Topologie** auf $X$, wenn die folgenden drei Axiome erfüllt sind (wodurch definiert wird, was „offene Mengen“ sind):

1. **Leere Menge und Gesamtmenge:** $\emptyset, X \in \mathcal{T}$


2. **Abgeschlossenheit unter endlichen Schnitten:** $A, B \in \mathcal{T} \implies A \cap B \in \mathcal{T}$


3. **Abgeschlossenheit unter beliebigen Vereinigungen:** Für eine Familie $(A_i)_{i \in I}$ mit $A_i \in \mathcal{T}$ gilt $\bigcup_{i \in I} A_i \in \mathcal{T}$



**Weitere Begriffe:**

* **Offene Mengen:** Die Elemente von $\mathcal{T}$ heißen *offene Mengen* (open sets).


* **Topologischer Raum:** Das Paar $(X, \mathcal{T})$ wird als *topologischer Raum* bezeichnet.



# Karte 2: Metrischer Raum (und Zusammenhang zur Topologie)

##  **Vorderseite:**
Woraus besteht ein **metrischer Raum** $(X, d)$ und wie motiviert er den Begriff der offenen Mengen in der Topologie?

##  **Rückseite:**

* **Aufbau:** Ein metrischer Raum $(X, d)$ besteht aus einer Menge $X$ und einer Distanzfunktion (Metrik) $d$.


* **Nachbarschaft / Offene Mengen:** Man verwendet die Definition einer offenen Menge bzw. einer $\varepsilon$-Umgebung $B_\varepsilon(x)$ eines Punktes $x$ als Nachbarschaft.


* **Bezug zur Potenzmenge $\mathcal{P}(X)$:** Aus den Notizen: $\mathcal{P}(X)$ enthält die Menge aller offenen Mengen von $X$ sowie deren Rekombinationen.



> **Mathematischer Hinweis zur Präzisierung deiner Notiz:**
> In deinen Notizen steht: *„$\mathcal{P}(X)$ ist somit ja auch die Menge aller offenen Mengen von $X$ wie auch deren Rekombinationen.“*
> Hier lohnt sich eine scharfe Trennung: $\mathcal{P}(X)$ ist die Potenzmenge, enthält also ausnahmslos *alle* möglichen Teilmengen von $X$ (auch die nicht-offenen). Die Menge aller offenen Mengen (die durch Vereinigungen von $\varepsilon$-Umgebungen entstehen) bildet die Topologie $\mathcal{T}$, und diese ist im Allgemeinen eine *echte Teilmenge* der Potenzmenge ($\mathcal{T} \subsetneq \mathcal{P}(X)$) – außer in dem Spezialfall der diskreten Topologie, in der tatsächlich jede Teilmenge als offen definiert wird ($\mathcal{T} = \mathcal{P}(X)$).
> 
> 

---