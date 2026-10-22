-- Optional framework event adapter for Boomerang RP.
-- This records lifecycle/job events without assuming a specific inventory or money resource.
-- Add this file after server.lua in fxmanifest.lua.
local function record(eventName, playerId, playerName, detail)
    if not playerId then return end
    exports[GetCurrentResourceName()]:RecordServerEvent(
        eventName,
        playerName or GetPlayerName(playerId) or 'Unknown player',
        playerId,
        detail or '',
        tostring(playerId)
    )
end

-- QBCore player load/unload/job events. Some servers use custom event names;
-- use the RecordServerEvent export from your framework resource if so.
RegisterNetEvent('QBCore:Server:PlayerLoaded', function(player)
    local src = source
    local data = type(player) == 'table' and (player.PlayerData or player) or {}
    local playerId = tonumber(data.source) or src
    local job = data.job and (data.job.label or data.job.name) or 'Unknown'
    record('QBCore player loaded', playerId, GetPlayerName(playerId), 'Job: ' .. tostring(job))
end)

RegisterNetEvent('QBCore:Server:OnPlayerUnload', function()
    local src = source
    record('QBCore player unloaded', src, GetPlayerName(src), 'Player unloaded from framework')
end)

RegisterNetEvent('QBCore:Server:OnJobUpdate', function(job)
    local src = source
    local name = type(job) == 'table' and (job.label or job.name) or tostring(job or 'Unknown')
    record('QBCore job changed', src, GetPlayerName(src), 'New job: ' .. tostring(name))
end)

-- ESX player/job events.
AddEventHandler('esx:playerLoaded', function(playerId, xPlayer, isNew)
    local src = tonumber(playerId) or source
    local job = type(xPlayer) == 'table' and xPlayer.job and (xPlayer.job.label or xPlayer.job.name) or 'Unknown'
    record('ESX player loaded', src, GetPlayerName(src), 'Job: ' .. tostring(job))
end)

AddEventHandler('esx:setJob', function(playerId, job, lastJob)
    local src = tonumber(playerId) or source
    local name = type(job) == 'table' and (job.label or job.name) or tostring(job or 'Unknown')
    record('ESX job changed', src, GetPlayerName(src), 'New job: ' .. tostring(name))
end)

-- Generic adapter for other resources/frameworks. Server-side resources can call:
-- exports['boomerang_bridge']:RecordServerEvent('inventory_changed', playerName, source, detail, externalId)
print('[boomerang_bridge] Optional framework lifecycle/job adapter loaded.')
