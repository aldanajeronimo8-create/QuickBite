import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Gift, Pencil, Plus, Power, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../lib/errorMessage';
import type { AdminLoyaltyRedemption, LoyaltyReward, LoyaltySettings } from '../../../lib/supabase';
import {
  createLoyaltyReward,
  fulfillLoyaltyRedemption,
  getLoyaltySettings,
  listAdminLoyaltyRedemptions,
  listLoyaltyRewards,
  updateLoyaltyReward,
  updateLoyaltySettings,
} from '../../../repositories/quickbiteRepository';
import { useDataStore } from '../../../store/dataStore';
import { useAuthStore } from '../../../store/authStore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';