import { Buffer } from 'buffer';
import { useEffect, useState } from 'react';
import {
  Alert, Button, PermissionsAndroid, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

const manager = new BleManager();

// UUIDs ตามที่อาจารย์กำหนด
const SERVICE_UUID = 'aee04821-1973-4e1f-a590-e84b10d580e7';
const CHAR_UUID = 'cde07b1a-889b-44b7-a99f-c888dddac729';

export default function Index() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  // States สำหรับเก็บข้อมูลแต่ละขั้นตอนตามโจทย์
  const [initialValue, setInitialValue] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [buddyName, setBuddyName] = useState<string>('');
  const [predictedGrade, setPredictedGrade] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');

  async function requestPermissions() {
    manager.stopDeviceScan();
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  }

  useEffect(() => {
    requestPermissions();
    return () => {
      manager.stopDeviceScan();
    };
  }, []);

  // 1. ค้นหาอุปกรณ์ BLE
  const startScan = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'กรุณาอนุญาตสิทธิ์ Bluetooth และ Location');
      return;
    }

    setDevices([]);
    // กรองเฉพาะอุปกรณ์ที่มี SERVICE_UUID ตามโจทย์ (ใส่ null แทน [SERVICE_UUID] ได้หากต้องการดูทุกอุปกรณ์)
    manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        console.log('Scan error:', error);
        Alert.alert('Scan Error', error.message);
        return;
      }
      if (device) {
        setDevices((prevDevices) => {
          if (prevDevices.some((d) => d.id === device.id)) return prevDevices;
          return [...prevDevices, device];
        });
      }
    });
  };

  // 2. เชื่อมต่ออุปกรณ์
  const connectToDevice = async (device: Device) => {
    manager.stopDeviceScan();
    try {
      const connected = await manager.connectToDevice(device.id);
      const discovered = await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(discovered);
      setStatusMessage(`Connected to ${discovered.name || discovered.id}`);
    } catch (error) {
      console.log('Connection failed:', error);
      Alert.alert('Connection Error', String(error));
    }
  };

  // โจทย์ข้อ 1: อ่านค่าเริ่มต้น (Read 1)
  const readInitialValue = async () => {
    if (!connectedDevice) return;
    try {
      const characteristic = await manager.readCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID
      );
      const rawData = Buffer.from(characteristic.value || '', 'base64').toString('utf-8');
      setInitialValue(rawData);
      setStatusMessage('Step 1 Completed: Read initial value.');
    } catch (error) {
      console.log('Read initial failed:', error);
      Alert.alert('Read Error', 'Failed to read characteristic.');
    }
  };

  // โจทย์ข้อ 2: ส่งชื่อของคุณและเพื่อนไปที่ Characteristic (Write)
  const writeNames = async () => {
    if (!connectedDevice) return;
    if (!myName.trim() || !buddyName.trim()) {
      Alert.alert('Input Error', "Please enter both your name and buddy's name.");
      return;
    }
    try {
      const textToWrite = `${myName.trim()} & ${buddyName.trim()}`;
      const base64Value = Buffer.from(textToWrite, 'utf-8').toString('base64');

      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID,
        base64Value
      );
      setStatusMessage(`Step 2 Completed: Wrote "${textToWrite}"`);
      Alert.alert('Success', `Successfully written: ${textToWrite}`);
    } catch (error) {
      console.log('Write failed:', error);
      Alert.alert('Write Error', 'Failed to write to device.');
    }
  };

  // โจทย์ข้อ 3: อ่านค่าอีกครั้งเพื่อรับเกรดทำนาย (Read 2)
  const readPredictedGrade = async () => {
    if (!connectedDevice) return;
    try {
      const characteristic = await manager.readCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID
      );
      const rawData = Buffer.from(characteristic.value || '', 'base64').toString('utf-8');
      setPredictedGrade(rawData);
      setStatusMessage('Step 3 Completed: Predicted grade received!');
    } catch (error) {
      console.log('Read grade failed:', error);
      Alert.alert('Read Error', 'Failed to read predicted grade.');
    }
  };

  // ยกเลิกการเชื่อมต่อ
  const disconnectDevice = async () => {
    if (!connectedDevice) return;
    await manager.cancelDeviceConnection(connectedDevice.id);
    setConnectedDevice(null);
    setInitialValue('');
    setPredictedGrade('');
    setStatusMessage('');
  };

  return (
    <ScrollView style={styles.container}>
      {!connectedDevice ? (
        <>
          <Text style={styles.header}>BLE Device Scanner</Text>
          <Button title="Scan Devices" onPress={startScan} />
          
          {/* เปลี่ยนจาก FlatList เป็น .map เพื่อป้องกัน Warning ใน ScrollView */}
          <View style={{ marginTop: 10 }}>
            {devices.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.deviceRow}
                onPress={() => connectToDevice(item)}
              >
                <Text style={styles.deviceName}>{item.name || 'Unnamed Device'}</Text>
                <Text style={styles.deviceId}>{item.id} | RSSI: {item.rssi} dBm</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.dashboard}>
          <Text style={styles.title}>Connected: {connectedDevice.name || connectedDevice.id}</Text>
          {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}

          {/* Step 1: Read Initial Value */}
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Step 1: Read Initial Value</Text>
            <Button title="1. Read Characteristic Value" onPress={readInitialValue} color="#007AFF" />
            <Text style={styles.resultText}>Initial Value: {initialValue || '-'}</Text>
          </View>

          {/* Step 2: Write Name & Buddy Name */}
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Step 2: Write Names</Text>
            <TextInput
              style={styles.input}
              placeholder="Your Name (ชื่อของคุณ)"
              placeholderTextColor="#888"
              value={myName}
              onChangeText={setMyName}
            />
            <TextInput
              style={styles.input}
              placeholder="Buddy's Name (ชื่อเพื่อน)"
              placeholderTextColor="#888"
              value={buddyName}
              onChangeText={setBuddyName}
            />
            <Button title="2. Write Names to Device" onPress={writeNames} color="#28A745" />
          </View>

          {/* Step 3: Read Predicted Grade */}
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Step 3: Read Predicted Grade</Text>
            <Button title="3. Read Grade Again" onPress={readPredictedGrade} color="#6F42C1" />
            <View style={styles.gradeBox}>
              <Text style={styles.gradeLabel}>Predicted Grade:</Text>
              <Text style={styles.gradeValue}>{predictedGrade || '?'}</Text>
            </View>
          </View>

          <View style={{ marginVertical: 15 }}>
            <Button title="Disconnect" onPress={disconnectDevice} color="#DC3545" />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 40, backgroundColor: '#f8f9fa' },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  deviceName: { fontSize: 16, fontWeight: '600' },
  deviceId: { fontSize: 12, color: '#666' },
  deviceRow: { padding: 15, marginVertical: 6, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  dashboard: { gap: 15, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  status: { fontSize: 13, color: '#007AFF', fontStyle: 'italic' },
  stepCard: { padding: 15, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', gap: 10 },
  stepTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  resultText: { fontSize: 14, color: '#444', marginTop: 5 },
  input: { padding: 10, borderColor: '#ccc', borderWidth: 1, borderRadius: 6, backgroundColor: '#fff' },
  gradeBox: { marginTop: 10, padding: 15, backgroundColor: '#e9ecef', borderRadius: 8, alignItems: 'center' },
  gradeLabel: { fontSize: 14, color: '#555' },
  gradeValue: { fontSize: 28, fontWeight: 'bold', color: '#28a745', marginTop: 5 }
});