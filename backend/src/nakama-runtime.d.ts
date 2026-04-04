/**
 * Nakama TypeScript Runtime declarations.
 * Sourced from: https://github.com/heroiclabs/nakama-common/blob/master/runtime/runtime.ts
 *
 * These types describe the globals Nakama injects into the JS runtime.
 * The `nkruntime` namespace is available globally — no import needed.
 */

declare namespace nkruntime {

  // ─── Context ───────────────────────────────────────────────────────────────

  interface Context {
    env: { [key: string]: string };
    executionMode: string;
    node: string;
    headers: { [key: string]: string[] };
    queryParams: { [key: string]: string[] };
    userId: string;
    username: string;
    vars: { [key: string]: string };
    userSessionExp: number;
    sessionId: string;
    clientIp: string;
    clientPort: string;
    matchId: string;
    matchNode: string;
    matchLabel: string;
    matchTickRate: number;
  }

  // ─── Logger ────────────────────────────────────────────────────────────────

  interface Logger {
    debug(msg: string, ...params: any[]): void;
    info(msg: string, ...params: any[]): void;
    warn(msg: string, ...params: any[]): void;
    error(msg: string, ...params: any[]): void;
    withField(key: string, value: any): Logger;
    withFields(fields: { [key: string]: any }): Logger;
    getFields(): { [key: string]: any };
  }

  // ─── Presence ──────────────────────────────────────────────────────────────

  interface Presence {
    userId: string;
    sessionId: string;
    username: string;
    node: string;
    status: string;
  }

  // ─── Match ─────────────────────────────────────────────────────────────────

  interface Match {
    matchId: string;
    authoritative: boolean;
    label: string;
    size: number;
    tickRate: number;
    handlerName: string;
  }

  interface MatchMessage {
    sender: Presence;
    persistence: boolean;
    status: string;
    opCode: number;
    data: string;
    reliable: boolean;
    receiveTimeMs: number;
  }

  type MatchState = { [key: string]: any };

  interface MatchDispatcher {
    broadcastMessage(
      opCode: number,
      data: string | null,
      presences: Presence[] | null,
      sender: Presence | null,
      reliable?: boolean
    ): void;
    broadcastMessageDeferred(
      opCode: number,
      data: string | null,
      presences: Presence[] | null,
      sender: Presence | null,
      reliable?: boolean
    ): void;
    matchLabelUpdate(label: string): void;
    matchKick(presences: Presence[]): void;
    matchRequestSignal(data: string): string;
  }

  // ─── User / Account ────────────────────────────────────────────────────────

  interface User {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    langTag: string;
    location: string;
    timezone: string;
    metadata: { [key: string]: any };
    facebookId: string;
    googleId: string;
    gamecenterId: string;
    steamId: string;
    online: boolean;
    edgeCount: number;
    createTime: number;
    updateTime: number;
  }

  interface Account {
    user: User;
    wallet: string;
    email: string;
    devices: { id: string }[];
    customId: string;
    verifyTime: number;
    disableTime: number;
  }

  // ─── Storage ───────────────────────────────────────────────────────────────

  interface StorageReadRequest {
    collection: string;
    key: string;
    userId: string;
  }

  interface StorageWriteRequest {
    collection: string;
    key: string;
    userId: string;
    value: { [key: string]: any };
    version?: string;
    permissionRead?: number;
    permissionWrite?: number;
  }

  interface StorageWriteAck {
    collection: string;
    key: string;
    userId: string;
    version: string;
  }

  interface StorageDeleteRequest {
    collection: string;
    key: string;
    userId: string;
    version?: string;
  }

  interface StorageObject {
    collection: string;
    key: string;
    userId: string;
    value: { [key: string]: any };
    version: string;
    permissionRead: number;
    permissionWrite: number;
    createTime: number;
    updateTime: number;
  }

  interface StorageObjectList {
    objects: StorageObject[];
    cursor: string;
  }

  // ─── Notifications ─────────────────────────────────────────────────────────

  interface NotificationSend {
    userId: string;
    subject: string;
    content: { [key: string]: any };
    code: number;
    senderId?: string;
    persistent?: boolean;
  }

  // ─── Matchmaker ────────────────────────────────────────────────────────────

  interface MatchmakerResult {
    presence: Presence;
    properties: { [key: string]: string | number };
  }

  // ─── Nakama runtime API ────────────────────────────────────────────────────

  interface Nakama {
    // Matches
    matchCreate(module: string, params?: { [key: string]: string }): string;
    matchGet(id: string): Match | null;
    matchList(
      limit: number,
      authoritative?: boolean,
      label?: string | null,
      minSize?: number | null,
      maxSize?: number | null,
      query?: string | null
    ): Match[];
    matchSignal(id: string, data: string): string;

    // Leaderboards (subset used by TicTacToe module)
    leaderboardCreate(
      id: string,
      authoritative?: boolean,
      sortOrder?: string,
      operator?: string,
      resetSchedule?: string,
      metadata?: { [key: string]: any }
    ): void;
    leaderboardRecordWrite(
      id: string,
      ownerId: string,
      username?: string,
      score?: number,
      subscore?: number,
      metadata?: { [key: string]: any } | null,
      operatorOverride?: string
    ): { [key: string]: any };

    // Users
    usersGetId(userIds: string[], facebookIds?: string[]): User[];
    usersGetUsername(usernames: string[]): User[];
    accountGetId(userId: string): Account;

    // Storage
    storageRead(reads: StorageReadRequest[]): StorageObject[];
    storageWrite(writes: StorageWriteRequest[]): StorageWriteAck[];
    storageDelete(deletes: StorageDeleteRequest[]): void;
    storageList(
      userId: string | void,
      collection: string,
      limit: number,
      cursor?: string
    ): StorageObjectList;

    // Notifications
    notificationSend(
      userId: string,
      subject: string,
      content: { [key: string]: any },
      code: number,
      senderId?: string,
      persistent?: boolean
    ): void;
    notificationsSend(notifications: NotificationSend[]): void;

    // Matchmaker
    matchmakerAdd(
      ctx: Context,
      minCount: number,
      maxCount: number,
      query: string,
      stringProperties?: { [key: string]: string },
      numericProperties?: { [key: string]: number }
    ): string;
    matchmakerRemove(ctx: Context, ticket: string): void;

    // Wallet
    walletUpdate(
      userId: string,
      changeset: { [key: string]: number },
      metadata?: { [key: string]: any },
      updateLedger?: boolean
    ): { previous: { [key: string]: number }; updated: { [key: string]: number } };

    // Misc
    uuidV4(): string;
    cronNext(expression: string, timestamp: number): number;
    sqlExec(query: string, ...args: any[]): { rowsAffected: number };
    sqlQuery(query: string, ...args: any[]): { [column: string]: any }[];
    httpRequest(
      url: string,
      method: string,
      headers?: { [key: string]: string },
      body?: string,
      timeout?: number
    ): { code: number; headers: { [key: string]: string[] }; body: string };
    base64Encode(input: string, padding?: boolean): string;
    base64Decode(input: string, padding?: boolean): string;
    base64UrlEncode(input: string, padding?: boolean): string;
    base64UrlDecode(input: string, padding?: boolean): string;
    aes128Encrypt(input: string, key: string): string;
    aes128Decrypt(input: string, key: string): string;
    aes256Encrypt(input: string, key: string): string;
    aes256Decrypt(input: string, key: string): string;
    hmacSha256Hash(input: string, key: string): string;
    md5Hash(input: string): string;
    sha256Hash(input: string): string;
    rsaSha256Hash(input: string, key: string): string;
    jwtGenerate(algorithm: string, claims: { [key: string]: any }, signingKey: string): string;
    localcacheGet(key: string): any;
    localcachePut(key: string, value: any, ttl?: number): void;
    localcacheDelete(key: string): void;
    event(evt: { name: string; properties: { [key: string]: string }; external?: boolean }): void;
    logger: Logger;
  }

  // ─── Initializer ──────────────────────────────────────────────────────────

  interface Initializer {
    registerRpc(id: string, func: RpcFunction): void;
    registerMatch(name: string, handler: MatchHandler): void;
    registerMatchmakerMatched(func: MatchmakerMatchedFunction): void;
    registerBeforeGetAccount(func: BeforeHookFunction<void>): void;
    registerAfterGetAccount(func: AfterHookFunction<Account>): void;
    registerEvent(func: EventFunction): void;
    registerShutdown(func: ShutdownFunction): void;
    registerLeaderboardReset(func: LeaderboardResetFunction): void;
    registerTournamentEnd(func: TournamentEndFunction): void;
    registerTournamentReset(func: TournamentResetFunction): void;
  }

  // ─── Function type signatures ──────────────────────────────────────────────

  type InitModule = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    initializer: Initializer
  ) => void;

  type RpcFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    payload: string
  ) => string | void;

  type MatchInitFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    params: { [key: string]: string }
  ) => { state: MatchState; tickRate: number; label: string };

  type MatchJoinAttemptFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: MatchState,
    presence: Presence,
    metadata: { [key: string]: any }
  ) => { state: MatchState | null; accept: boolean; rejectMessage?: string } | null;

  type MatchJoinFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: MatchState,
    presences: Presence[]
  ) => { state: MatchState | null } | null;

  type MatchLeaveFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: MatchState,
    presences: Presence[]
  ) => { state: MatchState | null } | null;

  type MatchLoopFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: MatchState,
    messages: MatchMessage[]
  ) => { state: MatchState | null } | null;

  type MatchTerminateFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: MatchState,
    graceSeconds: number
  ) => { state: MatchState | null } | null;

  type MatchSignalFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    dispatcher: MatchDispatcher,
    tick: number,
    state: MatchState,
    data: string
  ) => { state: MatchState | null; data: string } | null;

  interface MatchHandler {
    matchInit: MatchInitFunction;
    matchJoinAttempt: MatchJoinAttemptFunction;
    matchJoin: MatchJoinFunction;
    matchLeave: MatchLeaveFunction;
    matchLoop: MatchLoopFunction;
    matchTerminate: MatchTerminateFunction;
    matchSignal: MatchSignalFunction;
  }

  type MatchmakerMatchedFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    matches: MatchmakerResult[]
  ) => string | void;

  type BeforeHookFunction<T> = (ctx: Context, logger: Logger, nk: Nakama, data: T) => T | void;
  type AfterHookFunction<T>  = (ctx: Context, logger: Logger, nk: Nakama, data: T) => void;
  type EventFunction         = (ctx: Context, logger: Logger, evt: any) => void;
  type ShutdownFunction      = (ctx: Context, logger: Logger, nk: Nakama) => void;
  type LeaderboardResetFunction = (ctx: Context, logger: Logger, nk: Nakama, leaderboard: any, reset: number) => void;
  type TournamentEndFunction    = (ctx: Context, logger: Logger, nk: Nakama, tournament: any, end: number, reset: number) => void;
  type TournamentResetFunction  = (ctx: Context, logger: Logger, nk: Nakama, tournament: any, end: number, reset: number) => void;
}
