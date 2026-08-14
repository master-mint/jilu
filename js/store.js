(function () {
  const DB_NAME = "jilu-study";
  const DB_VERSION = 1;
  const STORES = {
    cards: "cards",
    reviews: "reviews",
    settings: "settings"
  };

  let dbPromise;

  function openDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.cards)) {
          db.createObjectStore(STORES.cards, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.reviews)) {
          const reviews = db.createObjectStore(STORES.reviews, { keyPath: "id" });
          reviews.createIndex("cardId", "cardId", { unique: false });
          reviews.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB 被其他页面占用"));
    });

    return dbPromise;
  }

  function transaction(storeName, mode, callback) {
    return openDatabase().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          const store = tx.objectStore(storeName);
          const result = callback(store);
          tx.oncomplete = () => resolve(result && result.result ? result.result : result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error("数据库事务已中止"));
        })
    );
  }

  function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createCard(input) {
    const now = Date.now();
    return {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      kind: input.kind || (input.image ? "image" : "text"),
      title: String(input.title || "").trim(),
      content: String(input.content || "").trim(),
      image: input.image || null,
      tags: input.tags || [],
      state: FSRS.createInitialState(),
      reviewCount: 0,
      ratingTotals: { again: 0, hard: 0, good: 0, easy: 0 },
      archived: false
    };
  }

  async function getAllCards() {
    const cards = await transaction(STORES.cards, "readonly", (store) =>
      requestAsPromise(store.getAll())
    );
    return cards.sort((a, b) => b.createdAt - a.createdAt);
  }

  async function getCard(id) {
    return transaction(STORES.cards, "readonly", (store) =>
      requestAsPromise(store.get(id))
    );
  }

  async function putCard(card) {
    card.updatedAt = Date.now();
    return transaction(STORES.cards, "readwrite", (store) =>
      requestAsPromise(store.put(card))
    );
  }

  async function putCards(cards) {
    await Promise.all(cards.map((card) => putCard(card)));
  }

  async function deleteCard(id) {
    await transaction(STORES.cards, "readwrite", (store) =>
      requestAsPromise(store.delete(id))
    );
    await transaction(STORES.reviews, "readwrite", (store) => {
      const index = store.index("cardId");
      const keyRange = IDBKeyRange.only(id);
      const cursorRequest = index.openCursor(keyRange);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
    });
  }

  async function addReview(review) {
    const item = {
      id: uid(),
      cardId: review.cardId,
      rating: review.rating,
      timestamp: review.timestamp || Date.now(),
      stability: review.stability || 0,
      difficulty: review.difficulty || 0,
      intervalDays: review.intervalDays || 0,
      elapsedDays: review.elapsedDays || 0,
      wasNew: Boolean(review.wasNew)
    };
    await transaction(STORES.reviews, "readwrite", (store) =>
      requestAsPromise(store.put(item))
    );
    return item;
  }

  async function getReviews() {
    return transaction(STORES.reviews, "readonly", (store) =>
      requestAsPromise(store.getAll())
    );
  }

  const DEFAULT_SETTINGS = {
    id: "main",
    dailyNewCards: 10,
    desiredRetention: 0.9,
    maxReviewsPerDay: 100,
    reminderTime: "20:00",
    notificationsEnabled: false,
    theme: "light",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  async function getSettings() {
    const settings = await transaction(STORES.settings, "readonly", (store) =>
      requestAsPromise(store.get("main"))
    );
    return { ...DEFAULT_SETTINGS, ...(settings || {}) };
  }

  async function saveSettings(patch) {
    const current = await getSettings();
    const next = {
      ...current,
      ...patch,
      id: "main",
      updatedAt: Date.now()
    };
    await transaction(STORES.settings, "readwrite", (store) =>
      requestAsPromise(store.put(next))
    );
    return next;
  }

  async function exportData() {
    const [cards, reviews, settings] = await Promise.all([
      getAllCards(),
      getReviews(),
      getSettings()
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: "记律",
      cards,
      reviews,
      settings
    };
  }

  async function importData(payload) {
    if (!payload || !Array.isArray(payload.cards) || !Array.isArray(payload.reviews)) {
      throw new Error("备份文件格式不正确");
    }

    const cards = payload.cards.map((card) => ({
      ...card,
      id: card.id || uid(),
      state: { ...FSRS.createInitialState(), ...(card.state || {}) }
    }));
    const reviews = payload.reviews.map((review) => ({
      ...review,
      id: review.id || uid()
    }));

    await putCards(cards);
    for (const review of reviews) {
      await addReview(review);
    }
    if (payload.settings) {
      await saveSettings(payload.settings);
    }
  }

  window.Store = {
    STORES,
    createCard,
    getAllCards,
    getCard,
    putCard,
    putCards,
    deleteCard,
    addReview,
    getReviews,
    getSettings,
    saveSettings,
    exportData,
    importData,
    openDatabase
  };
})();
