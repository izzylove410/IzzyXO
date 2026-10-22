local resourceName = GetCurrentResourceName()
local endpoint = GetConvar('boomerang_endpoint', '')
local secret = GetConvar('boomerang_secret', '')
local guildId = GetConvar('boomerang_guild_id', '')

local function sendEvent(eventType, playerName, playerId, detail, externalId)
    if endpoint == '' or secret == '' or guildId == '' then
        print('[boomerang_bridge] Missing boomerang_endpoint, boomerang_secret, or boomerang_guild_id')
        return
    end

    local payload = {
        guildId = guildId,
        type = eventType,
        playerName = tostring(playerName or 'Unknown player'),
        playerId = tostring(playerId or ''),
        detail = tostring(detail or ''),
        externalId = tostring(externalId or ''),
        timestamp = os.time() * 1000
    }

    local url = endpoint
    if not endpoint:match('/api/boomerang/events$') then
        url = endpoint .. '/api/boomerang/events'
    end

    PerformHttpRequest(url, function(status, body)
        if status < 200 or status >= 300 then
            print(('[boomerang_bridge] Event delivery failed (HTTP %s)'):format(status))
        end
    end, 'POST', json.encode(payload), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. secret,
        ['X-RP-Timestamp'] = tostring(payload.timestamp)
    })
end

AddEventHandler('playerConnecting', function(playerName, setKickReason, deferrals)
    sendEvent('playerConnecting', playerName, source, 'Player connecting')
end)

AddEventHandler('playerDropped', function(reason, resource, clientDropReason)
    local playerName = GetPlayerName(source) or 'Unknown player'
    sendEvent('playerDropped', playerName, source, tostring(reason or 'Disconnected'))
end)

exports('RecordServerEvent', function(eventType, playerName, playerId, detail, externalId)
    sendEvent('server_event', playerName, playerId,
        tostring(eventType or 'Custom server event') .. ': ' .. tostring(detail or ''), externalId)
end)

print('[boomerang_bridge] Bridge resource loaded. Configure convars and use exports to forward framework events.')
