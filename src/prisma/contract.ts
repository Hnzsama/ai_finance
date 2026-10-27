import { defineContract } from '@prisma/orm-postgres/contract-builder';

export const contract = defineContract({}, ({ field, model, rel }) => {
  const User = model('User', {
    fields: {
      id: field.id.uuidv7String(),
      phoneNumber: field.text().unique(), // Nomor HP terstandardisasi (cth: "628123456789")
      primaryJid: field.text(), // JID utama (cth: "628123456789@s.whatsapp.net")
      name: field.text().optional(),
      lastDevice: field.text().optional(), // 'MOBILE' | 'DESKTOP'
      lastJid: field.text().optional(), // JID spesifik sesi terakhir (@lid vs @s.whatsapp.net)
      lid: field.text().optional(), // WhatsApp Linked Identity (@lid) untuk akses dari Laptop / WhatsApp Web
      isRegistered: field.boolean().default(false), // Status apakah user sudah melengkapi data minimal/onboarding
      spreadsheetId: field.text().optional(), // Google Spreadsheet ID personal
      spreadsheetUrl: field.text().optional(), // Google Spreadsheet URL personal
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  const UserDevice = model('UserDevice', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString(),
      jid: field.text(), // JID spesifik perangkat (bisa berupa :1@s.whatsapp.net)
      deviceType: field.text(), // 'MOBILE' | 'DESKTOP'
      deviceLabel: field.text().optional(), // 'HP (WhatsApp Android/iOS)' | 'Laptop (WhatsApp Web/Desktop)'
      lastSeenAt: field.temporal.timestampString(),
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  const Wallet = model('Wallet', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(), // Kepemilikan personal per user
      jid: field.text().optional(), // JID WhatsApp pemilik
      name: field.text(),
      isDefault: field.boolean().default(false),
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  const Category = model('Category', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(), // Kepemilikan personal per user
      jid: field.text().optional(), // JID WhatsApp pemilik
      name: field.text(),
      type: field.text().default('EXPENSE'), // 'EXPENSE' | 'INCOME' | 'ALL'
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  const Transaction = model('Transaction', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(), // Isolasi data personal
      walletId: field.uuidString(),
      categoryId: field.uuidString(),
      type: field.text(), // 'INCOME' | 'EXPENSE'
      amount: field.bigint(),
      description: field.text(),
      rawText: field.text().optional(),
      userPhone: field.text().optional(),
      jid: field.text().optional(), // JID pengirim (deteksi HP vs Laptop)
      deviceType: field.text().optional(), // 'MOBILE' | 'DESKTOP'
      isSyncedToSheet: field.boolean().default(false),
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  const UserSetting = model('UserSetting', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(),
      userPhone: field.text().optional(),
      key: field.text(),
      value: field.text(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  // 7. Tabel Hutang & Piutang (Debt & Receivable)
  const Debt = model('Debt', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(),
      jid: field.text().optional(),
      type: field.text().default('DEBT'), // 'DEBT' (Hutang kita ke orang) | 'RECEIVABLE' (Piutang / orang berhutang ke kita)
      personName: field.text(), // Nama orang / pihak pemberi/penerima hutang
      amount: field.bigint(), // Total nominal
      remainingAmount: field.bigint(), // Sisa nominal yang belum terbayar
      dueDate: field.temporal.timestampString().optional(), // Batas waktu / jatuh tempo
      status: field.text().default('UNPAID'), // 'UNPAID' | 'PARTIAL' | 'PAID'
      description: field.text().optional(),
      walletId: field.uuidString().optional(), // Dompet penyalur/pelunas
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  // 8. Tabel Aset (Assets)
  const Asset = model('Asset', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(),
      jid: field.text().optional(),
      name: field.text(), // cth: "Motor Honda Beat 2021", "Laptop ASUS TUF Gaming"
      category: field.text().default('VEHICLE'), // 'VEHICLE' | 'ELECTRONIC' | 'FINANCIAL' | 'OTHER'
      value: field.bigint(), // Nilai taksiran saat ini
      purchasePrice: field.bigint().optional(), // Harga beli
      purchaseDate: field.temporal.timestampString().optional(),
      notes: field.text().optional(),
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  // 9. Tabel Budgeting / Anggaran per Kategori
  const Budget = model('Budget', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(),
      jid: field.text().optional(),
      categoryId: field.uuidString(), // Kategori yang dibatasi
      amount: field.bigint(), // Batas nominal (limit anggaran)
      period: field.text().default('MONTHLY'), // 'MONTHLY' | 'WEEKLY' | 'YEARLY'
      month: field.int().optional(), // 1 - 12
      year: field.int().optional(), // cth: 2026
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  // 10. Tabel Langganan Rutin (Subscription)
  const Subscription = model('Subscription', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(),
      jid: field.text().optional(),
      walletId: field.uuidString().optional(),
      categoryId: field.uuidString().optional(),
      name: field.text(), // cth: "Spotify Student", "Indihome / Kuota 50GB"
      amount: field.bigint(),
      billingCycle: field.text().default('MONTHLY'), // 'MONTHLY' | 'YEARLY'
      billingDay: field.int().optional(), // Tanggal potong bulanan (1-31)
      status: field.text().default('ACTIVE'), // 'ACTIVE' | 'PAUSED' | 'CANCELLED'
      nextBillingDate: field.temporal.timestampString().optional(),
      notes: field.text().optional(),
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  // 11. Tabel Pindah Antar Dompet & Mutasi COD (Transfer)
  const Transfer = model('Transfer', {
    fields: {
      id: field.id.uuidv7String(),
      userId: field.uuidString().optional(),
      jid: field.text().optional(),
      fromWalletId: field.uuidString(), // Dompet sumber (misal ShopeePay pada COD)
      toWalletId: field.uuidString(), // Dompet tujuan (misal Cash pada COD)
      amount: field.bigint(), // Nominal transfer
      adminFee: field.bigint().default(0n), // Biaya admin jika ada
      type: field.text().default('TRANSFER'), // 'TRANSFER' | 'COD_SETTLEMENT'
      description: field.text().optional(),
      createdAt: field.temporal.createdAtString(),
      updatedAt: field.temporal.updatedAtString(),
    },
  });

  return {
    models: {
      User: User.relations({
        devices: rel.hasMany(UserDevice, { by: 'userId' }),
        wallets: rel.hasMany(Wallet, { by: 'userId' }),
        categories: rel.hasMany(Category, { by: 'userId' }),
        transactions: rel.hasMany(Transaction, { by: 'userId' }),
        settings: rel.hasMany(UserSetting, { by: 'userId' }),
        debts: rel.hasMany(Debt, { by: 'userId' }),
        assets: rel.hasMany(Asset, { by: 'userId' }),
        budgets: rel.hasMany(Budget, { by: 'userId' }),
        subscriptions: rel.hasMany(Subscription, { by: 'userId' }),
        transfers: rel.hasMany(Transfer, { by: 'userId' }),
      }),
      UserDevice: UserDevice.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
      }),
      Wallet: Wallet.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
        transactions: rel.hasMany(Transaction, { by: 'walletId' }),
        transfersFrom: rel.hasMany(Transfer, { by: 'fromWalletId' }),
        transfersTo: rel.hasMany(Transfer, { by: 'toWalletId' }),
      }),
      Category: Category.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
        transactions: rel.hasMany(Transaction, { by: 'categoryId' }),
        budgets: rel.hasMany(Budget, { by: 'categoryId' }),
        subscriptions: rel.hasMany(Subscription, { by: 'categoryId' }),
      }),
      Transaction: Transaction.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
        wallet: rel.belongsTo(Wallet, { from: 'walletId', to: 'id' }),
        category: rel.belongsTo(Category, { from: 'categoryId', to: 'id' }),
      }),
      UserSetting: UserSetting.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
      }),
      Debt: Debt.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
        wallet: rel.belongsTo(Wallet, { from: 'walletId', to: 'id' }),
      }),
      Asset: Asset.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
      }),
      Budget: Budget.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
        category: rel.belongsTo(Category, { from: 'categoryId', to: 'id' }),
      }),
      Subscription: Subscription.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
        wallet: rel.belongsTo(Wallet, { from: 'walletId', to: 'id' }),
        category: rel.belongsTo(Category, { from: 'categoryId', to: 'id' }),
      }),
      Transfer: Transfer.relations({
        user: rel.belongsTo(User, { from: 'userId', to: 'id' }),
        fromWallet: rel.belongsTo(Wallet, { from: 'fromWalletId', to: 'id' }),
        toWallet: rel.belongsTo(Wallet, { from: 'toWalletId', to: 'id' }),
      }),
    },
  };
});
